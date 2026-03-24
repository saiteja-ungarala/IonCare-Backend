"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const connectionUrl = process.env.MYSQL_URL || process.env.DATABASE_URL || '';
const parsedConnectionUrl = connectionUrl ? new URL(connectionUrl) : null;
const getEnvValue = (...keys) => {
    for (const key of keys) {
        const value = process.env[key];
        if (value) {
            return value;
        }
    }
    return '';
};
const getConnectionUrlValue = (field) => {
    var _a;
    if (!parsedConnectionUrl) {
        return '';
    }
    if (field === 'pathname') {
        return parsedConnectionUrl.pathname.replace(/^\/+/, '');
    }
    return (_a = parsedConnectionUrl[field]) !== null && _a !== void 0 ? _a : '';
};
const getRequiredResolvedValue = (label, directValue, fallbackValue = '') => {
    const value = directValue || fallbackValue;
    if (!value) {
        throw new Error(`Required env var missing: ${label}`);
    }
    return value;
};
// Returns the env var value, or an empty string if not set.
// Used for third-party API keys that are temporarily disabled.
const getOptionalEnv = (key) => {
    var _a;
    return (_a = process.env[key]) !== null && _a !== void 0 ? _a : '';
};
exports.env = {
    port: Number(getEnvValue('PORT') || '5000'),
    BASE_SERVER_URL: (_a = process.env.BASE_SERVER_URL) !== null && _a !== void 0 ? _a : '',
    DB_PORT: Number(getRequiredResolvedValue('DB_PORT', getEnvValue('DB_PORT', 'MYSQLPORT'), getConnectionUrlValue('port'))),
    DB_HOST: getRequiredResolvedValue('DB_HOST', getEnvValue('DB_HOST', 'MYSQLHOST'), getConnectionUrlValue('hostname')),
    DB_USER: getRequiredResolvedValue('DB_USER', getEnvValue('DB_USER', 'MYSQLUSER'), decodeURIComponent(getConnectionUrlValue('username'))),
    DB_PASSWORD: getRequiredResolvedValue('DB_PASSWORD', getEnvValue('DB_PASSWORD', 'MYSQLPASSWORD'), decodeURIComponent(getConnectionUrlValue('password'))),
    DB_NAME: getRequiredResolvedValue('DB_NAME', getEnvValue('DB_NAME', 'MYSQLDATABASE'), decodeURIComponent(getConnectionUrlValue('pathname'))),
    JWT_SECRET: getRequiredResolvedValue('JWT_SECRET', getEnvValue('JWT_SECRET')),
    JWT_REFRESH_SECRET: getRequiredResolvedValue('JWT_REFRESH_SECRET', getEnvValue('JWT_REFRESH_SECRET')),
    JWT_ACCESS_EXPIRY: getRequiredResolvedValue('JWT_ACCESS_EXPIRY', getEnvValue('JWT_ACCESS_EXPIRY')),
    JWT_REFRESH_EXPIRY: getRequiredResolvedValue('JWT_REFRESH_EXPIRY', getEnvValue('JWT_REFRESH_EXPIRY')),
    NODE_ENV: (_b = process.env.NODE_ENV) !== null && _b !== void 0 ? _b : 'production',
    // ── Third-party keys (optional until configured in hosting platform) ─────
    RAZORPAY_KEY_ID: getOptionalEnv('RAZORPAY_KEY_ID'),
    RAZORPAY_KEY_SECRET: getOptionalEnv('RAZORPAY_KEY_SECRET'),
    RAZORPAY_WEBHOOK_SECRET: getOptionalEnv('RAZORPAY_WEBHOOK_SECRET'),
    FAST2SMS_API_KEY: getOptionalEnv('FAST2SMS_API_KEY'),
    SENDGRID_API_KEY: getOptionalEnv('SENDGRID_API_KEY'),
    BREVO_API_KEY: getOptionalEnv('BREVO_API_KEY'),
    BREVO_FROM_EMAIL: getOptionalEnv('BREVO_FROM_EMAIL'),
    BREVO_FROM_NAME: getOptionalEnv('BREVO_FROM_NAME'),
    SMTP_HOST: getOptionalEnv('SMTP_HOST'),
    SMTP_PORT: Number(getOptionalEnv('SMTP_PORT') || '587'),
    SMTP_USER: getOptionalEnv('SMTP_USER'),
    SMTP_PASS: getOptionalEnv('SMTP_PASS') || getOptionalEnv('SMTP_PAS'),
    FROM_EMAIL: getOptionalEnv('FROM_EMAIL'),
    FIREBASE_SERVICE_ACCOUNT_PATH: getOptionalEnv('FIREBASE_SERVICE_ACCOUNT_PATH'),
    FIREBASE_PROJECT_ID: getOptionalEnv('FIREBASE_PROJECT_ID'),
    FIREBASE_CLIENT_EMAIL: getOptionalEnv('FIREBASE_CLIENT_EMAIL'),
    FIREBASE_PRIVATE_KEY: getOptionalEnv('FIREBASE_PRIVATE_KEY'),
    GOOGLE_MAPS_API_KEY: (_c = process.env.GOOGLE_MAPS_API_KEY) !== null && _c !== void 0 ? _c : '',
};
