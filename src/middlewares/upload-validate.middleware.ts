import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import * as fileType from 'file-type';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MIME_EXTENSION_MAP: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'application/pdf': '.pdf',
};

const toAppError = (message: string) => ({
    type: 'AppError',
    message,
    statusCode: 400,
});

const getUploadedFiles = (req: Request): Express.Multer.File[] => {
    if (Array.isArray(req.files)) {
        return req.files as Express.Multer.File[];
    }

    if (req.file) {
        return [req.file];
    }

    if (req.files && typeof req.files === 'object') {
        return Object.values(req.files as Record<string, Express.Multer.File[]>).flat();
    }

    return [];
};

const deleteFileIfExists = (filePath?: string) => {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

const cleanupUploadedFiles = (files: Express.Multer.File[]) => {
    for (const file of files) {
        deleteFileIfExists(file.path);
    }
};

export const validateUploadedFiles = async (req: Request, _res: Response, next: NextFunction) => {
    const files = getUploadedFiles(req);
    if (files.length === 0) {
        return next();
    }

    try {
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                deleteFileIfExists(file.path);
                throw toAppError('File too large. Maximum size is 5MB');
            }

            const fileBuffer = fs.readFileSync(file.path);
            const detectedType = await fileType.fromBuffer(fileBuffer);

            if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
                deleteFileIfExists(file.path);
                throw toAppError('Invalid file type');
            }

            const fileExtension = MIME_EXTENSION_MAP[detectedType.mime] || path.extname(file.path) || '.bin';
            const newFilename = `${randomUUID()}${fileExtension}`;
            const newPath = path.join(path.dirname(file.path), newFilename);

            fs.renameSync(file.path, newPath);
            file.filename = newFilename;
            file.path = newPath;
            file.mimetype = detectedType.mime;
            file.size = fileBuffer.length;
        }

        return next();
    } catch (error) {
        cleanupUploadedFiles(files);
        if ((error as any)?.type === 'AppError') {
            return next(error);
        }
        return next(toAppError('Invalid file upload'));
    }
};
