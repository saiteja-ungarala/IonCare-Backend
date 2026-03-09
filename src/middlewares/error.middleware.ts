import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { errorResponse } from '../utils/response';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err);

    if (err.message === 'CORS') {
        return errorResponse(res, 'CORS', 403);
    }

    if (err.name === 'ZodError') {
        return errorResponse(res, 'Validation Error', 400, err.errors);
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return errorResponse(res, 'File too large. Maximum size is 5MB', 400);
    }

    if (err.type === 'AppError') {
        return errorResponse(res, err.message, err.statusCode, err.code ? { code: err.code } : null);
    }

    return errorResponse(res, 'Internal Server Error', 500, err.message);
};
