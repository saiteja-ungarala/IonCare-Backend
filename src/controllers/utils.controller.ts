import { Request, Response } from 'express';
import { env } from '../config/env';
import { successResponse, errorResponse } from '../utils/response';

export const geocode = async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return errorResponse(res, 'Invalid lat/lng parameters', 400);
    }

    try {
        let line1 = '';
        let city = '';
        let state = '';
        let postal_code = '';
        let address = '';

        if (env.GOOGLE_MAPS_API_KEY) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${env.GOOGLE_MAPS_API_KEY}`;
            const resp = await fetch(url);
            const data = await resp.json() as any;
            if (data.status !== 'OK' || !data.results?.length) {
                return errorResponse(res, 'Could not resolve address', 422);
            }
            const result = data.results[0];
            address = result.formatted_address;

            // Extract structured fields from address_components
            const get = (type: string) =>
                result.address_components?.find((c: any) => c.types.includes(type))?.long_name || '';

            const streetNumber = get('street_number');
            const route = get('route');
            const sublocality = get('sublocality_level_1') || get('sublocality');
            line1 = [streetNumber, route, sublocality].filter(Boolean).join(', ');
            city = get('locality') || get('administrative_area_level_2');
            state = get('administrative_area_level_1');
            postal_code = get('postal_code');
        } else {
            // Nominatim fallback — returns structured address object
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'IonCare/1.0 contact@ioncare.in' },
            });
            const data = await resp.json() as any;
            if (!data.display_name) {
                return errorResponse(res, 'Could not resolve address', 422);
            }
            address = data.display_name;

            const a = data.address || {};
            // Build line1 from the most specific parts
            const parts = [
                a.house_number,
                a.road || a.pedestrian || a.footway,
                a.suburb || a.neighbourhood || a.quarter,
            ].filter(Boolean);
            line1 = parts.join(', ');
            city = a.city || a.town || a.village || a.municipality || '';
            state = a.state || '';
            postal_code = a.postcode || '';
        }

        return successResponse(res, { address, line1, city, state, postal_code });
    } catch (err) {
        console.error('[Geocode] error:', err);
        return errorResponse(res, 'Geocode service unavailable', 503);
    }
};
