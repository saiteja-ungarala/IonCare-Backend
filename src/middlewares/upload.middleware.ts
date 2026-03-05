import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';

const createDiskUpload = (relativeFolder: string) => {
    const uploadFolder = path.resolve(__dirname, `../../uploads/${relativeFolder}`);
    fs.mkdirSync(uploadFolder, { recursive: true });

    const storage = multer.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, uploadFolder);
        },
        filename: (_req, _file, cb) => {
            cb(null, `${randomUUID()}.upload`);
        },
    });

    return multer({
        storage,
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 10,
        },
    });
};

export const kycUpload = createDiskUpload('agent-kyc');
export const dealerKycUpload = createDiskUpload('dealer-kyc');
