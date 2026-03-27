import { Request, Response, NextFunction } from 'express';
import { BookingService } from '../services/bookings.service';
import { successResponse } from '../utils/response';

export const getBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const result = await BookingService.getBookings(userId, req.query);
        return successResponse(res, result.data); 
    } catch (error) {
        next(error);
    }
};

export const createBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const result = await BookingService.createBooking(userId, req.body);
        return successResponse(res, result, 'Booking created', 201);
    } catch (error) {
        next(error);
    }
};

export const getBookingDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const bookingId = Number(req.params.id);
        const result = await BookingService.getBookingDetail(userId, bookingId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const bookingId = Number(req.params.id);
        const { reason } = req.body;
        const result = await BookingService.cancelBooking(userId, bookingId, reason);
        return successResponse(res, result, 'Booking cancelled');
    } catch (error) {
        next(error);
    }
};

export const getBookingUpdates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const bookingId = Number(req.params.bookingId);
        const updates = await BookingService.getBookingUpdates(userId, bookingId);
        return successResponse(res, updates);
    } catch (error) {
        next(error);
    }
};
