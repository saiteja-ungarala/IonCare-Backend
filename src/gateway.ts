import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { ResetPasswordSchema } from './dto/auth.dto';
import { errorHandler } from './middlewares/error.middleware';
import routes from './routers';
import { AuthService } from './services/auth.service';
import { renderResetPasswordPage } from './utils/resetPasswordPage';
import { errorResponse } from './utils/response';

const app = express();
app.set('trust proxy', 1);

const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const parseOrigin = (origin: string): URL | null => {
    try {
        return new URL(origin);
    } catch {
        return null;
    }
};

const isExpoDevOrigin = (origin: string): boolean => {
    const normalized = origin.toLowerCase();
    return normalized.startsWith('exp://')
        || normalized.includes('.exp.direct')
        || normalized.includes('.expo.dev');
};

const isLocalWebOrigin = (origin: string): boolean => {
    const parsed = parseOrigin(origin);
    if (!parsed) return false;

    const hostname = parsed.hostname.toLowerCase();

    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
        || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
        || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
};

const isRailwayOrigin = (origin: string): boolean => {
    const parsed = parseOrigin(origin);
    if (!parsed) return false;

    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith('.railway.app') || hostname.endsWith('.up.railway.app');
};

const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return true;

    return ALLOWED.includes(origin)
        || isExpoDevOrigin(origin)
        || isLocalWebOrigin(origin)
        || isRailwayOrigin(origin);
};

const createRateLimitHandler = (message: string) => (_req: express.Request, res: express.Response) => {
    return errorResponse(res, message, 429);
};

const createPostRateLimiter = (windowMs: number, max: number, message: string) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.method !== 'POST',
        handler: createRateLimitHandler(message),
    });

const createRateLimiter = (windowMs: number, max: number, message: string) =>
    rateLimit({
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

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
);

app.use(
    cors({
        origin: (origin, cb) =>
            isAllowedOrigin(origin ?? undefined)
                ? cb(null, true)
                : cb(new Error(`CORS: ${origin || 'unknown-origin'}`)),
        credentials: true,
        optionsSuccessStatus: 204,
    })
);

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/admin', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/reset-password', (req, res) => {
    const token = String(req.query.token || '').trim();

    res
        .status(token ? 200 : 400)
        .type('html')
        .send(
            renderResetPasswordPage({
                token,
                error: token ? null : 'This reset link is invalid or incomplete.',
            })
        );
});

app.post('/reset-password', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const parsed = ResetPasswordSchema.safeParse({ body: { token, newPassword } });

    if (!parsed.success) {
        return res
            .status(400)
            .type('html')
            .send(
                renderResetPasswordPage({
                    token,
                    error: parsed.error.errors[0]?.message || 'Please enter a valid password.',
                })
            );
    }

    try {
        await AuthService.resetPassword(parsed.data.body.token, parsed.data.body.newPassword);
        return res
            .status(200)
            .type('html')
            .send(
                renderResetPasswordPage({
                    success: true,
                    message: 'Password reset successful. You can now log in from the app.',
                })
            );
    } catch (error: any) {
        return res
            .status(Number(error?.statusCode || 400))
            .type('html')
            .send(
                renderResetPasswordPage({
                    token,
                    error: String(error?.message || 'Unable to reset password right now.'),
                })
            );
    }
});

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

app.use('/api', routes);
app.use(errorHandler);

export default app;
