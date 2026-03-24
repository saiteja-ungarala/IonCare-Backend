"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResetPasswordSchema = exports.LoginOtpVerifySchema = exports.LoginOtpResendSchema = exports.LoginOtpStartSchema = exports.SignupResendOtpSchema = exports.SignupVerifyFirebaseSmsSchema = exports.SignupVerifyOtpSchema = exports.SignupInitiateSchema = exports.VerifyOtpSchema = exports.SendOtpSchema = exports.RefreshSchema = exports.ForgotPasswordSchema = exports.LoginSchema = exports.SignupSchema = void 0;
const zod_1 = require("zod");
const technician_domain_1 = require("../utils/technician-domain");
// bcrypt silently truncates passwords longer than 72 bytes.
// Rejecting passwords > 72 chars prevents a subtle auth bypass where two
// different long passwords hash to the same bcrypt digest.
const signupPasswordField = zod_1.z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer');
const loginPasswordField = zod_1.z
    .string()
    .min(1, 'Password is required')
    .max(72, 'Password must be 72 characters or fewer');
const emailField = zod_1.z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address');
const phoneField = zod_1.z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9');
const fullNameField = zod_1.z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be 100 characters or fewer');
const normalizeRoleInput = (value) => (typeof value === 'string' ? (0, technician_domain_1.normalizeRoleValue)(value) : value);
const roleField = zod_1.z.preprocess(normalizeRoleInput, zod_1.z.enum(['customer', 'technician', 'dealer'], {
    errorMap: () => ({ message: 'Please select a valid role' }),
}));
const loginRoleField = zod_1.z.preprocess(normalizeRoleInput, zod_1.z.enum(['customer', 'technician', 'dealer', 'admin'], {
    errorMap: () => ({ message: 'Please select a valid role' }),
}));
const otpChannelField = zod_1.z.enum(['email', 'sms', 'whatsapp']);
const otpField = zod_1.z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits');
const sessionTokenField = zod_1.z.string().min(16, 'Session token is required');
exports.SignupSchema = zod_1.z.object({
    body: zod_1.z.object({
        full_name: fullNameField,
        email: emailField,
        password: signupPasswordField,
        phone: phoneField.optional(),
        role: roleField.default('customer'),
    }),
});
exports.LoginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: emailField,
        password: loginPasswordField,
        role: loginRoleField,
    }),
});
exports.ForgotPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: emailField,
    }),
});
exports.RefreshSchema = zod_1.z.object({
    body: zod_1.z.object({
        refreshToken: zod_1.z.string().min(1),
    }),
});
exports.SendOtpSchema = zod_1.z.object({
    body: zod_1.z.object({
        phone: phoneField,
    }),
});
exports.VerifyOtpSchema = zod_1.z.object({
    body: zod_1.z.object({
        phone: phoneField,
        otp: otpField,
    }),
});
exports.SignupInitiateSchema = exports.SignupSchema;
exports.SignupVerifyOtpSchema = zod_1.z.object({
    body: zod_1.z.object({
        sessionToken: sessionTokenField,
        channel: zod_1.z.enum(['email', 'sms']),
        otp: otpField,
    }),
});
exports.SignupVerifyFirebaseSmsSchema = zod_1.z.object({
    body: zod_1.z.object({
        sessionToken: sessionTokenField,
        firebaseIdToken: zod_1.z.string().min(1, 'Firebase ID token is required'),
    }),
});
exports.SignupResendOtpSchema = zod_1.z.object({
    body: zod_1.z.object({
        sessionToken: sessionTokenField,
        channel: zod_1.z.enum(['email', 'sms']),
    }),
});
exports.LoginOtpStartSchema = zod_1.z.object({
    body: zod_1.z.object({
        phone: phoneField,
        role: roleField,
    }),
});
exports.LoginOtpResendSchema = zod_1.z.object({
    body: zod_1.z.object({
        sessionToken: sessionTokenField,
        channel: otpChannelField,
    }),
});
exports.LoginOtpVerifySchema = zod_1.z.object({
    body: zod_1.z.object({
        sessionToken: sessionTokenField,
        channel: otpChannelField,
        otp: otpField,
    }),
});
exports.ResetPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string().min(1),
        newPassword: signupPasswordField,
    }),
});
