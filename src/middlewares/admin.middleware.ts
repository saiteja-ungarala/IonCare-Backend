import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || (req.user as any).role !== 'admin') {
        return errorResponse(res, 'Forbidden: Admin access required', 403);
    }
    next();
};
