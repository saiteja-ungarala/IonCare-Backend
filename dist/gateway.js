"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const routers_1 = __importDefault(require("./routers"));
const error_middleware_1 = require("./middlewares/error.middleware");
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const createPostRateLimiter = (windowMs, max, message) => (0, express_rate_limit_1.default)({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method !== 'POST',
    message: { error: message },
});
const authLoginLimiter = createPostRateLimiter(15 * 60 * 1000, 5, 'Too many login attempts. Please try again later.');
const authSignupLimiter = createPostRateLimiter(60 * 60 * 1000, 10, 'Too many signup attempts. Please try again later.');
const authSendOtpLimiter = createPostRateLimiter(60 * 60 * 1000, 3, 'Too many OTP requests. Please try again later.');
const kycUploadLimiter = createPostRateLimiter(60 * 60 * 1000, 10, 'Too many KYC upload attempts. Please try again later.');
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: (origin, cb) => (!origin || ALLOWED.includes(origin)) ? cb(null, true) : cb(new Error('CORS')),
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Static files (login page, etc.)
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/admin', express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
// Rate limits
app.use('/api/auth/login', authLoginLimiter);
app.use('/api/auth/signup', authSignupLimiter);
app.use('/api/auth/send-otp', authSendOtpLimiter);
app.use('/api/agent/kyc', kycUploadLimiter);
app.use('/api/dealer/kyc', kycUploadLimiter);
// Routes
app.use('/api', routers_1.default);
// Error Handler
app.use(error_middleware_1.errorHandler);
exports.default = app;
