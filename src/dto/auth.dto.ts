import { z } from 'zod';

export const SignupSchema = z.object({
    body: z.object({
        full_name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional(),
        role: z.enum(['customer', 'agent', 'dealer']).default('customer'),
    }),
});

export const LoginSchema = z.object({
    body: z.object({
        email: z.string().email(),
        password: z.string(),
        role: z.enum(['customer', 'agent', 'dealer']),
    }),
});

export const RefreshSchema = z.object({
    body: z.object({
        refreshToken: z.string(),
    }),
});

export const SendOtpSchema = z.object({
    body: z.object({
        phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
    }),
});

export const VerifyOtpSchema = z.object({
    body: z.object({
        phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
        otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
    }),
});

export const ResetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }),
});
