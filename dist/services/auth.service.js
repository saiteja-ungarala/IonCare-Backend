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
const auth_otp_session_model_1 = require("../models/auth-otp-session.model");
const sms_service_1 = require("./sms.service");
const email_service_1 = require("./email.service");
const firebase_admin_service_1 = require("./firebase-admin.service");
const env_1 = require("../config/env");
const technician_domain_1 = require("../utils/technician-domain");
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const SESSION_EXPIRY_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const WHATSAPP_OTP_ENABLED = false;
const createAppError = (message, statusCode, details) => ({
    type: 'AppError',
    message,
    statusCode,
    details,
});
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
const buildExpiryDate = (durationMs) => new Date(Date.now() + durationMs);
const maskEmail = (email) => {
    const [localPart, domain = ''] = email.split('@');
    if (!localPart || !domain)
        return email;
    const visible = localPart.slice(0, Math.min(2, localPart.length));
    return `${visible}${'*'.repeat(Math.max(2, localPart.length - visible.length))}@${domain}`;
};
const maskPhone = (phone) => {
    if (phone.length < 4)
        return phone;
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
};
const normalizeFirebasePhone = (phone) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
        return digits.slice(2);
    }
    return digits;
};
const assertIndianPhone = (phone) => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
        throw createAppError('Enter a valid 10-digit Indian mobile number.', 400, [{ field: 'phone', message: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' }]);
    }
};
const isRoleAllowedForUser = (user, role) => {
    if ((0, technician_domain_1.normalizeRoleValue)(user.role) === 'admin')
        return true;
    return (0, technician_domain_1.rolesMatch)(user.role, role);
};
const getSessionChannelState = (session, channel) => {
    if (channel === 'email') {
        return {
            otpHash: session.email_otp_hash,
            expiresAt: session.email_otp_expires_at,
            attempts: session.email_otp_attempts,
            verified: session.email_verified,
        };
    }
    if (channel === 'sms') {
        return {
            otpHash: session.sms_otp_hash,
            expiresAt: session.sms_otp_expires_at,
            attempts: session.sms_otp_attempts,
            verified: session.sms_verified,
        };
    }
    return {
        otpHash: session.whatsapp_otp_hash,
        expiresAt: session.whatsapp_otp_expires_at,
        attempts: session.whatsapp_otp_attempts,
        verified: session.whatsapp_verified,
    };
};
const buildOtpSessionPayload = (session, flow, currentChannel, nextChannel) => ({
    flow,
    sessionToken: session.session_token,
    currentChannel,
    nextChannel: nextChannel || null,
    maskedEmail: maskEmail(session.email),
    maskedPhone: maskPhone(session.phone),
    verifiedChannels: {
        email: session.email_verified,
        sms: session.sms_verified,
        whatsapp: session.whatsapp_verified,
    },
    expiresInSeconds: Math.max(0, Math.floor((session.expires_at.getTime() - Date.now()) / 1000)),
    availableChannels: flow === 'signup'
        ? ['email', 'sms']
        : (WHATSAPP_OTP_ENABLED ? ['email', 'whatsapp'] : ['email']),
    whatsappAvailable: WHATSAPP_OTP_ENABLED,
});
const assertValidSession = (session, purpose) => {
    if (!session || session.purpose !== purpose) {
        throw createAppError('Verification session not found. Please request a new OTP.', 400, [{ field: 'sessionToken', message: 'Verification session not found. Please request a new OTP.' }]);
    }
    if (session.expires_at < new Date()) {
        throw createAppError('Verification session expired. Please request a new OTP.', 400, [{ field: 'sessionToken', message: 'Verification session expired. Please request a new OTP.' }]);
    }
    return session;
};
const createUserAccount = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = yield user_model_1.UserModel.create(data);
    yield wallet_model_1.WalletModel.createWallet(userId);
    yield wallet_model_1.WalletModel.creditWithIdempotency(userId, {
        amount: 1000,
        txn_type: 'credit',
        source: 'welcome_bonus',
        idempotency_key: `welcome:${userId}`,
    });
    if (data.role === 'customer') {
        yield user_benefit_model_1.UserBenefitModel.create(userId, 'FIRST_SERVICE_FREE');
    }
    const user = yield user_model_1.UserModel.findById(userId);
    if (!user) {
        throw createAppError('Unable to complete account creation right now.', 500);
    }
    return user;
});
const sendOtpForSession = (session, channel, contextLabel) => __awaiter(void 0, void 0, void 0, function* () {
    if (channel === 'whatsapp' && !WHATSAPP_OTP_ENABLED) {
        throw createAppError('WhatsApp OTP is not available right now. It requires a paid provider setup.', 400, [{ field: 'channel', message: 'WhatsApp OTP is not available right now. It requires a paid provider setup.' }]);
    }
    const otp = generateOtp();
    const otpHash = yield bcrypt_1.default.hash(otp, 10);
    const otpExpiresAt = buildExpiryDate(OTP_EXPIRY_MS);
    yield auth_otp_session_model_1.AuthOtpSessionModel.setChannelOtp(session.session_token, channel, otpHash, otpExpiresAt);
    if (channel === 'email') {
        yield email_service_1.EmailService.sendOtpVerification(session.email, otp, contextLabel);
        return;
    }
    if (channel === 'sms') {
        yield sms_service_1.SmsService.sendOTP(session.phone, otp);
        return;
    }
});
const verifySessionOtp = (session, channel, otp) => __awaiter(void 0, void 0, void 0, function* () {
    const currentState = getSessionChannelState(session, channel);
    if (!currentState.otpHash || currentState.verified) {
        throw createAppError('OTP not found. Request a new one.', 400, [{ field: 'otp', message: 'OTP not found. Request a new one.' }]);
    }
    if (!currentState.expiresAt || currentState.expiresAt < new Date()) {
        throw createAppError('OTP expired. Request a new one.', 400, [{ field: 'otp', message: 'OTP expired. Request a new one.' }]);
    }
    if (currentState.attempts >= MAX_OTP_ATTEMPTS) {
        throw createAppError('Too many attempts. Request a new OTP.', 429, [{ field: 'otp', message: 'Too many attempts. Request a new OTP.' }]);
    }
    const isMatch = yield bcrypt_1.default.compare(otp, currentState.otpHash);
    if (!isMatch) {
        yield auth_otp_session_model_1.AuthOtpSessionModel.incrementAttempts(session.session_token, channel);
        return false;
    }
    yield auth_otp_session_model_1.AuthOtpSessionModel.markChannelVerified(session.session_token, channel);
    return true;
});
const finalizeSignupIfReady = (updatedSession) => __awaiter(void 0, void 0, void 0, function* () {
    if (!updatedSession.email_verified) {
        return {
            completed: false,
            session: buildOtpSessionPayload(updatedSession, 'signup', 'email', 'sms'),
        };
    }
    if (!updatedSession.sms_verified) {
        return {
            completed: false,
            session: buildOtpSessionPayload(updatedSession, 'signup', 'sms'),
        };
    }
    let user = updatedSession.created_user_id
        ? yield user_model_1.UserModel.findById(updatedSession.created_user_id)
        : null;
    if (!user) {
        const existingEmailUser = yield user_model_1.UserModel.findByEmail(updatedSession.email);
        if (existingEmailUser) {
            throw createAppError('This email is already registered. Please log in.', 409, [{ field: 'email', message: 'This email is already registered.' }]);
        }
        const existingPhoneUser = yield user_model_1.UserModel.findByPhone(updatedSession.phone);
        if (existingPhoneUser) {
            throw createAppError('This phone number is already registered. Please log in.', 409, [{ field: 'phone', message: 'This phone number is already registered.' }]);
        }
        user = yield createUserAccount({
            role: (0, technician_domain_1.normalizeRoleValue)(updatedSession.role),
            full_name: updatedSession.full_name || '',
            email: updatedSession.email,
            phone: updatedSession.phone,
            password_hash: updatedSession.password_hash || '',
        });
        yield auth_otp_session_model_1.AuthOtpSessionModel.setCreatedUser(updatedSession.session_token, user.id);
    }
    const tokens = yield exports.AuthService.generateTokens(user);
    return Object.assign({ completed: true, user: exports.AuthService.sanitizeUser(user) }, tokens);
});
exports.AuthService = {
    signup(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedRole = (0, technician_domain_1.normalizeRoleValue)(data.role);
            const existingUser = yield user_model_1.UserModel.findByEmail(data.email);
            if (existingUser) {
                throw createAppError('This email is already registered. Please log in.', 409, [{ field: 'email', message: 'This email is already registered.' }]);
            }
            if (data.phone) {
                const existingPhoneUser = yield user_model_1.UserModel.findByPhone(data.phone);
                if (existingPhoneUser) {
                    throw createAppError('This phone number is already registered. Please log in.', 409, [{ field: 'phone', message: 'This phone number is already registered.' }]);
                }
            }
            const hashedPassword = yield bcrypt_1.default.hash(data.password_hash, 10);
            const user = yield createUserAccount(Object.assign(Object.assign({}, data), { role: normalizedRole, password_hash: hashedPassword }));
            const tokens = yield this.generateTokens(user);
            return Object.assign({ user: this.sanitizeUser(user) }, tokens);
        });
    },
    initiateSignupVerification(data) {
        return __awaiter(this, void 0, void 0, function* () {
            assertIndianPhone(data.phone || '');
            const normalizedRole = (0, technician_domain_1.normalizeRoleValue)(data.role);
            const existingUser = yield user_model_1.UserModel.findByEmail(data.email);
            if (existingUser) {
                throw createAppError('This email is already registered. Please log in.', 409, [{ field: 'email', message: 'This email is already registered.' }]);
            }
            const existingPhoneUser = yield user_model_1.UserModel.findByPhone(data.phone);
            if (existingPhoneUser) {
                throw createAppError('This phone number is already registered. Please log in.', 409, [{ field: 'phone', message: 'This phone number is already registered.' }]);
            }
            yield auth_otp_session_model_1.AuthOtpSessionModel.deleteExpired();
            yield auth_otp_session_model_1.AuthOtpSessionModel.deleteByPurposeAndIdentity('signup', {
                email: data.email,
                phone: data.phone,
            });
            const hashedPassword = yield bcrypt_1.default.hash(data.password_hash, 10);
            const sessionToken = (0, crypto_1.randomUUID)().replace(/-/g, '');
            const expiresAt = buildExpiryDate(SESSION_EXPIRY_MS);
            yield auth_otp_session_model_1.AuthOtpSessionModel.create({
                session_token: sessionToken,
                purpose: 'signup',
                role: normalizedRole,
                user_id: null,
                created_user_id: null,
                full_name: data.full_name,
                email: data.email,
                phone: data.phone,
                password_hash: hashedPassword,
                email_otp_hash: null,
                email_otp_expires_at: null,
                email_otp_attempts: 0,
                email_verified: false,
                sms_otp_hash: null,
                sms_otp_expires_at: null,
                sms_otp_attempts: 0,
                sms_verified: false,
                whatsapp_otp_hash: null,
                whatsapp_otp_expires_at: null,
                whatsapp_otp_attempts: 0,
                whatsapp_verified: false,
                expires_at: expiresAt,
            });
            const session = yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken);
            const activeSession = assertValidSession(session, 'signup');
            try {
                yield sendOtpForSession(activeSession, 'email', 'email verification');
            }
            catch (error) {
                yield auth_otp_session_model_1.AuthOtpSessionModel.deleteBySessionToken(sessionToken);
                throw error;
            }
            const updatedSession = yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken);
            return buildOtpSessionPayload(assertValidSession(updatedSession, 'signup'), 'signup', 'email', 'sms');
        });
    },
    verifySignupOtp(sessionToken, channel, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
            if (channel === 'sms' && !session.email_verified) {
                throw createAppError('Please verify your email OTP first.', 400, [{ field: 'channel', message: 'Please verify your email OTP first.' }]);
            }
            const isValid = yield verifySessionOtp(session, channel, otp);
            if (!isValid) {
                throw createAppError('Invalid OTP. Please try again.', 400, [{ field: 'otp', message: 'Invalid OTP. Please try again.' }]);
            }
            const updatedSession = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
            return yield finalizeSignupIfReady(updatedSession);
        });
    },
    verifySignupFirebaseSms(sessionToken, firebaseIdToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
            if (!session.email_verified) {
                throw createAppError('Please verify your email OTP first.', 400, [{ field: 'channel', message: 'Please verify your email OTP first.' }]);
            }
            const { phoneNumber } = yield firebase_admin_service_1.FirebaseAdminService.verifyPhoneIdToken(firebaseIdToken);
            const normalizedFirebasePhone = normalizeFirebasePhone(phoneNumber);
            if (normalizedFirebasePhone !== session.phone) {
                throw createAppError('This SMS verification does not match the signup phone number.', 400, [{ field: 'firebaseIdToken', message: 'This SMS verification does not match the signup phone number.' }]);
            }
            if (!session.sms_verified) {
                yield auth_otp_session_model_1.AuthOtpSessionModel.markChannelVerified(session.session_token, 'sms');
            }
            const updatedSession = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
            return yield finalizeSignupIfReady(updatedSession);
        });
    },
    resendSignupOtp(sessionToken, channel) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
            if (channel === 'sms' && !session.email_verified) {
                throw createAppError('Please verify your email OTP first.', 400, [{ field: 'channel', message: 'Please verify your email OTP first.' }]);
            }
            if (channel === 'sms') {
                return buildOtpSessionPayload(session, 'signup', 'sms');
            }
            yield sendOtpForSession(session, channel, channel === 'email' ? 'email verification' : 'mobile verification');
            const updatedSession = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
            return buildOtpSessionPayload(updatedSession, 'signup', channel === 'email' ? 'email' : 'sms', channel === 'email' && !updatedSession.sms_verified ? 'sms' : undefined);
        });
    },
    login(email, password, role) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield user_model_1.UserModel.findByEmail(email);
            if (!user) {
                throw createAppError('Account not found. Please sign up.', 404, [{ field: 'email', message: 'No account found with this email.' }]);
            }
            if (!isRoleAllowedForUser(user, role)) {
                throw createAppError(`No ${role} account found with this email.`, 404, [{ field: 'email', message: `No ${role} account found with this email.` }]);
            }
            const isPasswordValid = yield bcrypt_1.default.compare(password, user.password_hash);
            if (!isPasswordValid) {
                throw createAppError('Incorrect password. Please try again.', 401, [{ field: 'password', message: 'Incorrect password. Please try again.' }]);
            }
            const tokens = yield this.generateTokens(user);
            return Object.assign({ user: this.sanitizeUser(user) }, tokens);
        });
    },
    initiateLoginOtp(phone, role) {
        return __awaiter(this, void 0, void 0, function* () {
            assertIndianPhone(phone);
            const user = yield user_model_1.UserModel.findByPhone(phone);
            if (!user) {
                throw createAppError('No account found for this phone number.', 404, [{ field: 'phone', message: 'No account found for this phone number.' }]);
            }
            if (!isRoleAllowedForUser(user, role)) {
                throw createAppError(`No ${role} account found for this phone number.`, 404, [{ field: 'phone', message: `No ${role} account found for this phone number.` }]);
            }
            if (!user.email) {
                throw createAppError('This account does not have a registered email. Please use password login.', 400, [{ field: 'phone', message: 'This account does not have a registered email. Please use password login.' }]);
            }
            yield auth_otp_session_model_1.AuthOtpSessionModel.deleteExpired();
            yield auth_otp_session_model_1.AuthOtpSessionModel.deleteByPurposeAndIdentity('login', {
                userId: user.id,
                phone,
            });
            const sessionToken = (0, crypto_1.randomUUID)().replace(/-/g, '');
            const expiresAt = buildExpiryDate(SESSION_EXPIRY_MS);
            yield auth_otp_session_model_1.AuthOtpSessionModel.create({
                session_token: sessionToken,
                purpose: 'login',
                role: (0, technician_domain_1.normalizeRoleValue)(user.role),
                user_id: user.id || null,
                created_user_id: null,
                full_name: user.full_name,
                email: user.email,
                phone,
                password_hash: null,
                email_otp_hash: null,
                email_otp_expires_at: null,
                email_otp_attempts: 0,
                email_verified: false,
                sms_otp_hash: null,
                sms_otp_expires_at: null,
                sms_otp_attempts: 0,
                sms_verified: false,
                whatsapp_otp_hash: null,
                whatsapp_otp_expires_at: null,
                whatsapp_otp_attempts: 0,
                whatsapp_verified: false,
                expires_at: expiresAt,
            });
            const session = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
            try {
                yield sendOtpForSession(session, 'email', 'login');
            }
            catch (error) {
                yield auth_otp_session_model_1.AuthOtpSessionModel.deleteBySessionToken(sessionToken);
                throw error;
            }
            const updatedSession = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
            return buildOtpSessionPayload(updatedSession, 'login', 'email');
        });
    },
    resendLoginOtp(sessionToken, channel) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
            yield sendOtpForSession(session, channel, channel === 'email' ? 'login' : 'WhatsApp login');
            const updatedSession = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
            return buildOtpSessionPayload(updatedSession, 'login', channel);
        });
    },
    verifyLoginOtp(sessionToken, channel, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = assertValidSession(yield auth_otp_session_model_1.AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
            const isValid = yield verifySessionOtp(session, channel, otp);
            if (!isValid) {
                throw createAppError('Invalid OTP. Please try again.', 400, [{ field: 'otp', message: 'Invalid OTP. Please try again.' }]);
            }
            const user = session.user_id
                ? yield user_model_1.UserModel.findById(session.user_id)
                : yield user_model_1.UserModel.findByPhone(session.phone);
            if (!user) {
                throw createAppError('No account found for this phone number.', 404, [{ field: 'phone', message: 'No account found for this phone number.' }]);
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
            const normalizedRole = (0, technician_domain_1.normalizeRoleValue)(user.role);
            const accessToken = jsonwebtoken_1.default.sign({ id: user.id, role: normalizedRole, email: user.email }, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_ACCESS_EXPIRY });
            const refreshToken = jsonwebtoken_1.default.sign({ id: user.id, jti: (0, crypto_1.randomUUID)() }, env_1.env.JWT_REFRESH_SECRET, { expiresIn: env_1.env.JWT_REFRESH_EXPIRY });
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            yield user_model_1.UserModel.createSession(user.id, refreshToken, undefined, undefined, expiresAt);
            return { accessToken, refreshToken };
        });
    },
    sanitizeUser(user) {
        const { password_hash } = user, rest = __rest(user, ["password_hash"]);
        return Object.assign(Object.assign({}, rest), { role: (0, technician_domain_1.normalizeRoleValue)(rest.role) });
    },
    sendOTP(phone) {
        return __awaiter(this, void 0, void 0, function* () {
            assertIndianPhone(phone);
            const otp = generateOtp();
            const otpHash = yield bcrypt_1.default.hash(otp, 10);
            const expiresAt = buildExpiryDate(OTP_EXPIRY_MS);
            yield otp_model_1.OtpModel.create(phone, otpHash, expiresAt);
            yield sms_service_1.SmsService.sendOTP(phone, otp);
        });
    },
    verifyOTP(phone, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const record = yield otp_model_1.OtpModel.findLatestByPhone(phone);
            if (!record || record.verified) {
                throw createAppError('OTP not found. Request a new one.', 400, [{ field: 'otp', message: 'OTP not found. Request a new one.' }]);
            }
            if (record.expires_at < new Date()) {
                throw createAppError('OTP expired. Request a new one.', 400, [{ field: 'otp', message: 'OTP expired. Request a new one.' }]);
            }
            if (record.attempts >= MAX_OTP_ATTEMPTS) {
                throw createAppError('Too many attempts. Request a new OTP.', 429, [{ field: 'otp', message: 'Too many attempts. Request a new OTP.' }]);
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
                return;
            const token = (0, crypto_1.randomBytes)(32).toString('hex');
            const hashedToken = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
            const expires = new Date(Date.now() + 15 * 60 * 1000);
            yield user_model_1.UserModel.setResetToken(user.id, hashedToken, expires);
            const resetLink = `${env_1.env.BASE_SERVER_URL}/reset-password?token=${token}`;
            yield email_service_1.EmailService.sendPasswordReset(email, resetLink);
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
                throw createAppError('Invalid OTP. Please try again.', 400, [{ field: 'otp', message: 'Invalid OTP. Please try again.' }]);
            }
            const user = yield user_model_1.UserModel.findByPhone(phone);
            if (!user) {
                throw createAppError('No account found for this phone number.', 404, [{ field: 'phone', message: 'No account found for this phone number.' }]);
            }
            const tokens = yield this.generateTokens(user);
            return Object.assign({ user: this.sanitizeUser(user) }, tokens);
        });
    },
};
