"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET || !process.env.DB_PASSWORD) {
    throw new Error('Required env vars missing');
}
const getRequiredEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        throw new Error('Required env vars missing');
    }
    return value;
};
exports.env = {
    port: Number(getRequiredEnv('PORT')),
    BASE_SERVER_URL: (_a = process.env.BASE_SERVER_URL) !== null && _a !== void 0 ? _a : '',
    DB_PORT: Number(getRequiredEnv('DB_PORT')),
    DB_HOST: getRequiredEnv('DB_HOST'),
    DB_USER: getRequiredEnv('DB_USER'),
    DB_PASSWORD: getRequiredEnv('DB_PASSWORD'),
    DB_NAME: getRequiredEnv('DB_NAME'),
    JWT_SECRET: getRequiredEnv('JWT_SECRET'),
    JWT_REFRESH_SECRET: getRequiredEnv('JWT_REFRESH_SECRET'),
    JWT_ACCESS_EXPIRY: getRequiredEnv('JWT_ACCESS_EXPIRY'),
    JWT_REFRESH_EXPIRY: getRequiredEnv('JWT_REFRESH_EXPIRY'),
    NODE_ENV: (_b = process.env.NODE_ENV) !== null && _b !== void 0 ? _b : 'production',
};
