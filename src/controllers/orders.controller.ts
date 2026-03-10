import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/orders.service';
import { successResponse } from '../utils/response';

export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const result = await OrderService.getOrders(userId, req.query);
        return successResponse(res, result.data);
    } catch (error) {
        next(error);
    }
};

export const getOrderById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const orderId = Number(req.params.id);
        const result = await OrderService.getOrderById(userId, orderId);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const checkout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const result = await OrderService.checkout(userId, req.body);
        return successResponse(res, result, 'Order placed successfully', 201);
    } catch (error) {
        next(error);
    }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const orderId = Number(req.params.id);
        const { reason } = req.body;
        const result = await OrderService.cancelOrder(userId, orderId, reason);
        return successResponse(res, result, 'Order cancelled');
    } catch (error) {
        next(error);
    }
};
