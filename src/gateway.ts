import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import routes from './routers';
import { errorHandler } from './middlewares/error.middleware';

const app = express();
app.set('trust proxy', 1);
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);

const createPostRateLimiter = (windowMs: number, max: number, message: string) => rateLimit({
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
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
    origin: (origin, cb) => (!origin || ALLOWED.includes(origin)) ? cb(null, true) : cb(new Error('CORS')),
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (login page, etc.)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/admin', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Rate limits
app.use('/api/auth/login', authLoginLimiter);
app.use('/api/auth/signup', authSignupLimiter);
app.use('/api/auth/send-otp', authSendOtpLimiter);
app.use('/api/agent/kyc', kycUploadLimiter);
app.use('/api/dealer/kyc', kycUploadLimiter);

// Routes
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

export default app;
