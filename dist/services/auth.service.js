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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const user_model_1 = require("../models/user.model");
const wallet_model_1 = require("../models/wallet.model");
const user_benefit_model_1 = require("../models/user-benefit.model");
const otp_model_1 = require("../models/otp.model");
const sms_service_1 = require("./sms.service");
const email_service_1 = require("./email.service");
const env_1 = require("../config/env");
exports.AuthService = {
    signup(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingUser = yield user_model_1.UserModel.findByEmail(data.email);
            if (existingUser) {
                throw { type: 'AppError', message: 'Email already exists', statusCode: 409 };
            }
            const hashedPassword = yield bcrypt_1.default.hash(data.password_hash, 10);
            const userId = yield user_model_1.UserModel.create(Object.assign(Object.assign({}, data), { password_hash: hashedPassword }));
            // Wallet setup + welcome bonus
            yield wallet_model_1.WalletModel.createWallet(userId);
            yield wallet_model_1.WalletModel.creditWithIdempotency(userId, {
                amount: 1000,
                txn_type: 'credit',
                source: 'welcome_bonus',
                idempotency_key: `welcome:${userId}`,
            });
            // First Service Free benefit for new customers
            if (data.role === 'customer') {
                yield user_benefit_model_1.UserBenefitModel.create(userId, 'FIRST_SERVICE_FREE');
            }
            const user = yield user_model_1.UserModel.findById(userId);
            const tokens = yield this.generateTokens(user);
            return Object.assign({ user: this.sanitizeUser(user) }, tokens);
        });
    },
    login(email, password, role) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield user_model_1.UserModel.findByEmail(email);
            // User not found - return 404
            if (!user) {
                throw { type: 'AppError', message: 'User not found', statusCode: 404 };
            }
            // Enforce selected role login. If mismatch, do not allow cross-role login.
            if (role && user.role !== role) {
                throw { type: 'AppError', message: 'Credentials not found', statusCode: 404 };
            }
            // Wrong password - return 401
            const isPasswordValid = yield bcrypt_1.default.compare(password, user.password_hash);
            if (!isPasswordValid) {
                throw { type: 'AppError', message: 'Invalid password', statusCode: 401 };
            }
            const tokens = yield this.generateTokens(user);
            return Object.assign({ user: this.sanitizeUser(user) }, tokens);
        });
    },
    refreshToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield user_model_1.UserModel.findSessionByToken(token);
            if (!session) {
                throw { type: 'AppError', message: 'Invalid or expired refresh token', statusCode: 401 };
            }
            const user = yield user_model_1.UserModel.findById(session.user_id);
            if (!user) {
                throw { type: 'AppError', message: 'User not found', statusCode: 404 };
            }
            // Revoke old token (Rotation)
            yield user_model_1.UserModel.revokeSession(token);
            const tokens = yield this.generateTokens(user);
            return Object.assign({}, tokens);
        });
    },
    logout(token) {
        return __awaiter(this, void 0, void 0, function* () {
            yield user_model_1.UserModel.revokeSession(token);
        });
    },
    generateTokens(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const accessToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, email: user.email }, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_ACCESS_EXPIRY });
            const refreshToken = jsonwebtoken_1.default.sign({ id: user.id, jti: (0, crypto_1.randomUUID)() }, env_1.env.JWT_REFRESH_SECRET, { expiresIn: env_1.env.JWT_REFRESH_EXPIRY });
            // Store refresh token in DB
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
            yield user_model_1.UserModel.createSession(user.id, refreshToken, undefined, undefined, expiresAt);
            return { accessToken, refreshToken };
        });
    },
    sanitizeUser(user) {
        const { password_hash } = user, rest = __rest(user, ["password_hash"]);
        return rest;
    },
    sendOTP(phone) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!/^\d{10}$/.test(phone)) {
                throw { type: 'AppError', message: 'Phone number must be exactly 10 digits', statusCode: 400 };
            }
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpHash = yield bcrypt_1.default.hash(otp, 10);
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
            yield otp_model_1.OtpModel.create(phone, otpHash, expiresAt);
            yield sms_service_1.SmsService.sendOTP(phone, otp);
            // OTP is never logged or returned
        });
    },
    verifyOTP(phone, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const record = yield otp_model_1.OtpModel.findLatestByPhone(phone);
            if (!record || record.verified) {
                throw { type: 'AppError', message: 'OTP not found. Request a new one.', statusCode: 400 };
            }
            if (record.expires_at < new Date()) {
                throw { type: 'AppError', message: 'OTP expired. Request a new one.', statusCode: 400 };
            }
            if (record.attempts >= 5) {
                throw { type: 'AppError', message: 'Too many attempts. Request new OTP.', statusCode: 429 };
            }
            const isMatch = yield bcrypt_1.default.compare(otp, record.otp_hash);
            if (!isMatch) {
                yield otp_model_1.OtpModel.incrementAttempts(record.id);
                return false;
            }
            yield otp_model_1.OtpModel.markVerified(record.id);
            return true;
        });
    },
    initiateForgotPassword(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield user_model_1.UserModel.findByEmail(email);
            if (!user || !user.id)
                return; // silently do nothing if not found
            const token = (0, crypto_1.randomBytes)(32).toString('hex');
            const hashedToken = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            yield user_model_1.UserModel.setResetToken(user.id, hashedToken, expires);
            const resetLink = `${env_1.env.BASE_SERVER_URL}/reset-password?token=${token}`;
            email_service_1.EmailService.sendPasswordReset(email, resetLink); // fire-and-forget
        });
    },
    resetPassword(token, newPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            const hashedToken = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
            const user = yield user_model_1.UserModel.findByResetToken(hashedToken);
            if (!user || !user.id) {
                throw { type: 'AppError', message: 'Invalid or expired reset link', statusCode: 400 };
            }
            const newHash = yield bcrypt_1.default.hash(newPassword, 10);
            yield user_model_1.UserModel.update(user.id, { password_hash: newHash });
            yield user_model_1.UserModel.clearResetToken(user.id);
        });
    },
    loginWithOTP(phone, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const isValid = yield this.verifyOTP(phone, otp);
            if (!isValid) {
                throw { type: 'AppError', message: 'Invalid OTP', statusCode: 400 };
            }
            const user = yield user_model_1.UserModel.findByPhone(phone);
            if (!user) {
                throw { type: 'AppError', message: 'No account found for this phone number', statusCode: 404 };
            }
            const tokens = yield this.generateTokens(user);
            return Object.assign({ user: this.sanitizeUser(user) }, tokens);
        });
    },
};
