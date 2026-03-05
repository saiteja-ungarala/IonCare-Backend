import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET || !process.env.DB_PASSWORD) {
    throw new Error('Required env vars missing');
}

const getRequiredEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error('Required env vars missing');
    }
    return value;
};

export const env = {
    port: Number(getRequiredEnv('PORT')),
    BASE_SERVER_URL: process.env.BASE_SERVER_URL ?? '',
    DB_PORT: Number(getRequiredEnv('DB_PORT')),
    DB_HOST: getRequiredEnv('DB_HOST'),
    DB_USER: getRequiredEnv('DB_USER'),
    DB_PASSWORD: getRequiredEnv('DB_PASSWORD'),
    DB_NAME: getRequiredEnv('DB_NAME'),
    JWT_SECRET: getRequiredEnv('JWT_SECRET'),
    JWT_REFRESH_SECRET: getRequiredEnv('JWT_REFRESH_SECRET'),
    JWT_ACCESS_EXPIRY: getRequiredEnv('JWT_ACCESS_EXPIRY'),
    JWT_REFRESH_EXPIRY: getRequiredEnv('JWT_REFRESH_EXPIRY'),
    NODE_ENV: process.env.NODE_ENV ?? 'production',
};
