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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyOtp = exports.sendOtp = exports.resetPassword = exports.forgotPassword = exports.me = exports.logout = exports.refresh = exports.login = exports.signup = void 0;
const auth_service_1 = require("../services/auth.service");
const user_model_1 = require("../models/user.model");
const wallet_model_1 = require("../models/wallet.model");
const response_1 = require("../utils/response");
const signup = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield auth_service_1.AuthService.signup(Object.assign(Object.assign({}, req.body), { password_hash: req.body.password }));
        return (0, response_1.successResponse)(res, result, 'User created successfully', 201);
    }
    catch (error) {
        next(error);
    }
});
exports.signup = signup;
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield auth_service_1.AuthService.login(req.body.email, req.body.password, req.body.role);
        return (0, response_1.successResponse)(res, result, 'Login successful');
    }
    catch (error) {
        next(error);
    }
});
exports.login = login;
const refresh = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield auth_service_1.AuthService.refreshToken(req.body.refreshToken);
        return (0, response_1.successResponse)(res, result, 'Token refreshed');
    }
    catch (error) {
        next(error);
    }
});
exports.refresh = refresh;
const logout = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Expect refresh token in body for now, to revoke specific session
        yield auth_service_1.AuthService.logout(req.body.refreshToken);
        return (0, response_1.successResponse)(res, null, 'Logged out successfully');
    }
    catch (error) {
        next(error);
    }
});
exports.logout = logout;
const me = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        // Fetch full user from DB
        const user = yield user_model_1.UserModel.findById(userId);
        if (!user) {
            throw { type: 'AppError', message: 'User not found', statusCode: 404 };
        }
        // Ensure wallet exists for user
        yield wallet_model_1.WalletModel.createWallet(userId);
        // Return sanitized user with camelCase fields
        const sanitizedUser = {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            phone: user.phone || null,
            role: user.role,
            referralCode: user.referral_code || null,
        };
        return (0, response_1.successResponse)(res, { user: sanitizedUser });
    }
    catch (error) {
        next(error);
    }
});
exports.me = me;
const forgotPassword = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    // Fire-and-forget — never await, never reveal if email exists
    auth_service_1.AuthService.initiateForgotPassword(email).catch((err) => console.error('[Auth] forgotPassword error:', err));
    return (0, response_1.successResponse)(res, null, 'If that email exists a reset link was sent');
});
exports.forgotPassword = forgotPassword;
const resetPassword = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token, newPassword } = req.body;
        yield auth_service_1.AuthService.resetPassword(token, newPassword);
        return (0, response_1.successResponse)(res, null, 'Password reset successfully');
    }
    catch (error) {
        next(error);
    }
});
exports.resetPassword = resetPassword;
const sendOtp = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phone } = req.body;
        yield auth_service_1.AuthService.sendOTP(phone);
        return (0, response_1.successResponse)(res, null, 'OTP sent');
    }
    catch (error) {
        next(error);
    }
});
exports.sendOtp = sendOtp;
const verifyOtp = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phone, otp } = req.body;
        const result = yield auth_service_1.AuthService.loginWithOTP(phone, otp);
        return (0, response_1.successResponse)(res, result, 'Login successful');
    }
    catch (error) {
        next(error);
    }
});
exports.verifyOtp = verifyOtp;
