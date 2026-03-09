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
        let address: string;
        let rawResult: any;

        if (env.GOOGLE_MAPS_API_KEY) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${env.GOOGLE_MAPS_API_KEY}`;
            const resp = await fetch(url);
            const data = await resp.json() as any;
            if (data.status === 'OK' && data.results?.length > 0) {
                address = data.results[0].formatted_address;
                rawResult = data.results[0];
            } else {
                return errorResponse(res, 'Could not resolve address', 422);
            }
        } else {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'AquaCare/1.0' },
            });
            const data = await resp.json() as any;
            if (!data.display_name) {
                return errorResponse(res, 'Could not resolve address', 422);
            }
            address = data.display_name;
            rawResult = data;
        }

        return successResponse(res, { address, raw: rawResult });
    } catch (err) {
        console.error('[Geocode] error:', err);
        return errorResponse(res, 'Geocode service unavailable', 503);
    }
};
