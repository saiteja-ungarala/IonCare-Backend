"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_dto_1 = require("./dto/auth.dto");
const error_middleware_1 = require("./middlewares/error.middleware");
const routers_1 = __importDefault(require("./routers"));
const auth_service_1 = require("./services/auth.service");
const resetPasswordPage_1 = require("./utils/resetPasswordPage");
const response_1 = require("./utils/response");
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const parseOrigin = (origin) => {
    try {
        return new URL(origin);
    }
    catch (_a) {
        return null;
    }
};
const isExpoDevOrigin = (origin) => {
    const normalized = origin.toLowerCase();
    return normalized.startsWith('exp://')
        || normalized.includes('.exp.direct')
        || normalized.includes('.expo.dev');
};
const isLocalWebOrigin = (origin) => {
    const parsed = parseOrigin(origin);
    if (!parsed)
        return false;
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
        || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
        || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
};
const isRailwayOrigin = (origin) => {
    const parsed = parseOrigin(origin);
    if (!parsed)
        return false;
    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith('.railway.app') || hostname.endsWith('.up.railway.app');
};
const isAllowedOrigin = (origin) => {
    if (!origin)
        return true;
    return ALLOWED.includes(origin)
        || isExpoDevOrigin(origin)
        || isLocalWebOrigin(origin)
        || isRailwayOrigin(origin);
};
const createRateLimitHandler = (message) => (_req, res) => {
    return (0, response_1.errorResponse)(res, message, 429);
};
const createPostRateLimiter = (windowMs, max, message) => (0, express_rate_limit_1.default)({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method !== 'POST',
    handler: createRateLimitHandler(message),
});
const createRateLimiter = (windowMs, max, message) => (0, express_rate_limit_1.default)({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitHandler(message),
});
const authLoginLimiter = createPostRateLimiter(15 * 60 * 1000, 5, 'Too many login attempts. Please try again later.');
const authSignupLimiter = createPostRateLimiter(60 * 60 * 1000, 10, 'Too many signup attempts. Please try again later.');
const authSignupResendOtpLimiter = createPostRateLimiter(15 * 60 * 1000, 5, 'Too many OTP requests. Please try again later.');
const authLegacySendOtpLimiter = createPostRateLimiter(15 * 60 * 1000, 5, 'Too many OTP requests. Please try again later.');
const authLoginSendOtpLimiter = createPostRateLimiter(15 * 60 * 1000, 5, 'Too many OTP requests. Please try again later.');
const authLoginResendOtpLimiter = createPostRateLimiter(15 * 60 * 1000, 5, 'Too many OTP requests. Please try again later.');
const authLegacyVerifyOtpLimiter = createPostRateLimiter(15 * 60 * 1000, 10, 'Too many OTP verification attempts. Please try again later.');
const authLoginVerifyOtpLimiter = createPostRateLimiter(15 * 60 * 1000, 10, 'Too many OTP verification attempts. Please try again later.');
const kycUploadLimiter = createPostRateLimiter(60 * 60 * 1000, 10, 'Too many KYC upload attempts. Please try again later.');
const authRefreshLimiter = createRateLimiter(15 * 60 * 1000, 20, 'Too many token refresh requests. Please try again later.');
const authForgotPasswordLimiter = createRateLimiter(60 * 60 * 1000, 5, 'Too many password reset requests. Please try again later.');
const authResetPasswordLimiter = createRateLimiter(60 * 60 * 1000, 10, 'Too many password reset attempts. Please try again later.');
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: (origin, cb) => isAllowedOrigin(origin !== null && origin !== void 0 ? origin : undefined)
        ? cb(null, true)
        : cb(new Error(`CORS: ${origin || 'unknown-origin'}`)),
    credentials: true,
    optionsSuccessStatus: 204,
}));
app.use(express_1.default.json({ limit: '50kb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50kb' }));
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/admin', express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/reset-password', (req, res) => {
    const token = String(req.query.token || '').trim();
    res
        .status(token ? 200 : 400)
        .type('html')
        .send((0, resetPasswordPage_1.renderResetPasswordPage)({
        token,
        error: token ? null : 'This reset link is invalid or incomplete.',
    }));
});
app.post('/reset-password', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const token = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.token) || '').trim();
    const newPassword = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.newPassword) || '');
    const parsed = auth_dto_1.ResetPasswordSchema.safeParse({ body: { token, newPassword } });
    if (!parsed.success) {
        return res
            .status(400)
            .type('html')
            .send((0, resetPasswordPage_1.renderResetPasswordPage)({
            token,
            error: ((_c = parsed.error.errors[0]) === null || _c === void 0 ? void 0 : _c.message) || 'Please enter a valid password.',
        }));
    }
    try {
        yield auth_service_1.AuthService.resetPassword(parsed.data.body.token, parsed.data.body.newPassword);
        return res
            .status(200)
            .type('html')
            .send((0, resetPasswordPage_1.renderResetPasswordPage)({
            success: true,
            message: 'Password reset successful. You can now log in from the app.',
        }));
    }
    catch (error) {
        return res
            .status(Number((error === null || error === void 0 ? void 0 : error.statusCode) || 400))
            .type('html')
            .send((0, resetPasswordPage_1.renderResetPasswordPage)({
            token,
            error: String((error === null || error === void 0 ? void 0 : error.message) || 'Unable to reset password right now.'),
        }));
    }
}));
app.post('/api/auth/login', authLoginLimiter);
app.post('/api/auth/signup', authSignupLimiter);
app.post('/api/auth/signup/initiate', authSignupLimiter);
app.post('/api/auth/signup/resend-otp', authSignupResendOtpLimiter);
app.post('/api/auth/send-otp', authLegacySendOtpLimiter);
app.post('/api/auth/verify-otp', authLegacyVerifyOtpLimiter);
app.post('/api/auth/login/send-otp', authLoginSendOtpLimiter);
app.post('/api/auth/login/resend-otp', authLoginResendOtpLimiter);
app.post('/api/auth/login/verify-otp', authLoginVerifyOtpLimiter);
app.use('/api/technician/kyc', kycUploadLimiter);
app.use('/api/dealer/kyc', kycUploadLimiter);
app.use('/api/auth/refresh', authRefreshLimiter);
app.use('/api/auth/forgot-password', authForgotPasswordLimiter);
app.use('/api/auth/reset-password', authResetPasswordLimiter);
app.use('/api', routers_1.default);
app.use(error_middleware_1.errorHandler);
exports.default = app;
