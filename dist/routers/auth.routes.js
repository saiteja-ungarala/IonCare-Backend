"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_dto_1 = require("../dto/auth.dto");
const AuthController = __importStar(require("../controllers/auth.controller"));
const router = (0, express_1.Router)();
router.post('/signup', (0, validate_middleware_1.validate)(auth_dto_1.SignupSchema), AuthController.signup);
router.post('/signup/initiate', (0, validate_middleware_1.validate)(auth_dto_1.SignupInitiateSchema), AuthController.initiateSignup);
router.post('/signup/verify-otp', (0, validate_middleware_1.validate)(auth_dto_1.SignupVerifyOtpSchema), AuthController.verifySignupOtp);
router.post('/signup/verify-firebase-sms', (0, validate_middleware_1.validate)(auth_dto_1.SignupVerifyFirebaseSmsSchema), AuthController.verifySignupFirebaseSms);
router.post('/signup/resend-otp', (0, validate_middleware_1.validate)(auth_dto_1.SignupResendOtpSchema), AuthController.resendSignupOtp);
router.post('/login', (0, validate_middleware_1.validate)(auth_dto_1.LoginSchema), AuthController.login);
router.post('/login/send-otp', (0, validate_middleware_1.validate)(auth_dto_1.LoginOtpStartSchema), AuthController.startLoginOtp);
router.post('/login/resend-otp', (0, validate_middleware_1.validate)(auth_dto_1.LoginOtpResendSchema), AuthController.resendLoginOtp);
router.post('/login/verify-otp', (0, validate_middleware_1.validate)(auth_dto_1.LoginOtpVerifySchema), AuthController.verifyLoginOtp);
router.post('/refresh', (0, validate_middleware_1.validate)(auth_dto_1.RefreshSchema), AuthController.refresh);
router.post('/logout', auth_middleware_1.authenticate, AuthController.logout);
router.post('/forgot-password', (0, validate_middleware_1.validate)(auth_dto_1.ForgotPasswordSchema), AuthController.forgotPassword);
router.get('/me', auth_middleware_1.authenticate, AuthController.me);
router.post('/send-otp', (0, validate_middleware_1.validate)(auth_dto_1.SendOtpSchema), AuthController.sendOtp);
router.post('/verify-otp', (0, validate_middleware_1.validate)(auth_dto_1.VerifyOtpSchema), AuthController.verifyOtp);
router.post('/reset-password', (0, validate_middleware_1.validate)(auth_dto_1.ResetPasswordSchema), AuthController.resetPassword);
exports.default = router;
