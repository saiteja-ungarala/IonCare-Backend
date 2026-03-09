"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResetPasswordSchema = exports.VerifyOtpSchema = exports.SendOtpSchema = exports.RefreshSchema = exports.LoginSchema = exports.SignupSchema = void 0;
const zod_1 = require("zod");
exports.SignupSchema = zod_1.z.object({
    body: zod_1.z.object({
        full_name: zod_1.z.string().min(2),
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(6),
        phone: zod_1.z.string().optional(),
        role: zod_1.z.enum(['customer', 'agent', 'dealer']).default('customer'),
    }),
});
exports.LoginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string(),
        role: zod_1.z.enum(['customer', 'agent', 'dealer']).optional(),
    }),
});
exports.RefreshSchema = zod_1.z.object({
    body: zod_1.z.object({
        refreshToken: zod_1.z.string(),
    }),
});
exports.SendOtpSchema = zod_1.z.object({
    body: zod_1.z.object({
        phone: zod_1.z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
    }),
});
exports.VerifyOtpSchema = zod_1.z.object({
    body: zod_1.z.object({
        phone: zod_1.z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
        otp: zod_1.z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
    }),
});
exports.ResetPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string().min(1),
        newPassword: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    }),
});
