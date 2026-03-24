import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { UserModel, User } from '../models/user.model';
import { WalletModel } from '../models/wallet.model';
import { UserBenefitModel } from '../models/user-benefit.model';
import { OtpModel } from '../models/otp.model';
import { AuthOtpChannel, AuthOtpPurpose, AuthOtpSession, AuthOtpSessionModel } from '../models/auth-otp-session.model';
import { SmsService } from './sms.service';
import { EmailService } from './email.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { env } from '../config/env';
import { normalizeRoleValue, rolesMatch } from '../utils/technician-domain';

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const SESSION_EXPIRY_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const WHATSAPP_OTP_ENABLED = false;

const createAppError = (
    message: string,
    statusCode: number,
    details?: Array<{ field: string; message: string }>
) => ({
    type: 'AppError',
    message,
    statusCode,
    details,
});

const generateOtp = (): string => Math.floor(100000 + Math.random() * 900000).toString();

const buildExpiryDate = (durationMs: number): Date => new Date(Date.now() + durationMs);

const maskEmail = (email: string): string => {
    const [localPart, domain = ''] = email.split('@');
    if (!localPart || !domain) return email;

    const visible = localPart.slice(0, Math.min(2, localPart.length));
    return `${visible}${'*'.repeat(Math.max(2, localPart.length - visible.length))}@${domain}`;
};

const maskPhone = (phone: string): string => {
    if (phone.length < 4) return phone;
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
};

const normalizeFirebasePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
        return digits.slice(2);
    }
    return digits;
};

const assertIndianPhone = (phone: string) => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
        throw createAppError(
            'Enter a valid 10-digit Indian mobile number.',
            400,
            [{ field: 'phone', message: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' }],
        );
    }
};

const isRoleAllowedForUser = (
    user: User,
    role: 'customer' | 'technician' | 'dealer' | 'admin'
): boolean => {
    if (normalizeRoleValue(user.role) === 'admin') return true;
    return rolesMatch(user.role, role);
};

const getSessionChannelState = (session: AuthOtpSession, channel: AuthOtpChannel) => {
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

const buildOtpSessionPayload = (
    session: AuthOtpSession,
    flow: AuthOtpPurpose,
    currentChannel: AuthOtpChannel,
    nextChannel?: AuthOtpChannel
) => ({
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

const assertValidSession = (session: AuthOtpSession | null, purpose: AuthOtpPurpose): AuthOtpSession => {
    if (!session || session.purpose !== purpose) {
        throw createAppError(
            'Verification session not found. Please request a new OTP.',
            400,
            [{ field: 'sessionToken', message: 'Verification session not found. Please request a new OTP.' }],
        );
    }

    if (session.expires_at < new Date()) {
        throw createAppError(
            'Verification session expired. Please request a new OTP.',
            400,
            [{ field: 'sessionToken', message: 'Verification session expired. Please request a new OTP.' }],
        );
    }

    return session;
};

const createUserAccount = async (data: User): Promise<User> => {
    const userId = await UserModel.create(data);

    await WalletModel.createWallet(userId);
    await WalletModel.creditWithIdempotency(userId, {
        amount: 1000,
        txn_type: 'credit',
        source: 'welcome_bonus',
        idempotency_key: `welcome:${userId}`,
    });

    if (data.role === 'customer') {
        await UserBenefitModel.create(userId, 'FIRST_SERVICE_FREE');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
        throw createAppError('Unable to complete account creation right now.', 500);
    }

    return user;
};

const sendOtpForSession = async (session: AuthOtpSession, channel: AuthOtpChannel, contextLabel: string): Promise<void> => {
    if (channel === 'whatsapp' && !WHATSAPP_OTP_ENABLED) {
        throw createAppError(
            'WhatsApp OTP is not available right now. It requires a paid provider setup.',
            400,
            [{ field: 'channel', message: 'WhatsApp OTP is not available right now. It requires a paid provider setup.' }],
        );
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = buildExpiryDate(OTP_EXPIRY_MS);

    await AuthOtpSessionModel.setChannelOtp(session.session_token, channel, otpHash, otpExpiresAt);

    if (channel === 'email') {
        await EmailService.sendOtpVerification(session.email, otp, contextLabel);
        return;
    }

    if (channel === 'sms') {
        await SmsService.sendOTP(session.phone, otp);
        return;
    }
};

const verifySessionOtp = async (session: AuthOtpSession, channel: AuthOtpChannel, otp: string): Promise<boolean> => {
    const currentState = getSessionChannelState(session, channel);

    if (!currentState.otpHash || currentState.verified) {
        throw createAppError(
            'OTP not found. Request a new one.',
            400,
            [{ field: 'otp', message: 'OTP not found. Request a new one.' }],
        );
    }

    if (!currentState.expiresAt || currentState.expiresAt < new Date()) {
        throw createAppError(
            'OTP expired. Request a new one.',
            400,
            [{ field: 'otp', message: 'OTP expired. Request a new one.' }],
        );
    }

    if (currentState.attempts >= MAX_OTP_ATTEMPTS) {
        throw createAppError(
            'Too many attempts. Request a new OTP.',
            429,
            [{ field: 'otp', message: 'Too many attempts. Request a new OTP.' }],
        );
    }

    const isMatch = await bcrypt.compare(otp, currentState.otpHash);
    if (!isMatch) {
        await AuthOtpSessionModel.incrementAttempts(session.session_token, channel);
        return false;
    }

    await AuthOtpSessionModel.markChannelVerified(session.session_token, channel);
    return true;
};

const finalizeSignupIfReady = async (updatedSession: AuthOtpSession): Promise<any> => {
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
        ? await UserModel.findById(updatedSession.created_user_id)
        : null;

    if (!user) {
        const existingEmailUser = await UserModel.findByEmail(updatedSession.email);
        if (existingEmailUser) {
            throw createAppError(
                'This email is already registered. Please log in.',
                409,
                [{ field: 'email', message: 'This email is already registered.' }],
            );
        }

        const existingPhoneUser = await UserModel.findByPhone(updatedSession.phone);
        if (existingPhoneUser) {
            throw createAppError(
                'This phone number is already registered. Please log in.',
                409,
                [{ field: 'phone', message: 'This phone number is already registered.' }],
            );
        }

        user = await createUserAccount({
            role: normalizeRoleValue(updatedSession.role) as User['role'],
            full_name: updatedSession.full_name || '',
            email: updatedSession.email,
            phone: updatedSession.phone,
            password_hash: updatedSession.password_hash || '',
        });

        await AuthOtpSessionModel.setCreatedUser(updatedSession.session_token, user.id!);
    }

    const tokens = await AuthService.generateTokens(user);
    return {
        completed: true,
        user: AuthService.sanitizeUser(user),
        ...tokens,
    };
};

export const AuthService = {
    async signup(data: User): Promise<any> {
        const normalizedRole = normalizeRoleValue(data.role) as User['role'];

        const existingUser = await UserModel.findByEmail(data.email);
        if (existingUser) {
            throw createAppError(
                'This email is already registered. Please log in.',
                409,
                [{ field: 'email', message: 'This email is already registered.' }],
            );
        }

        if (data.phone) {
            const existingPhoneUser = await UserModel.findByPhone(data.phone);
            if (existingPhoneUser) {
                throw createAppError(
                    'This phone number is already registered. Please log in.',
                    409,
                    [{ field: 'phone', message: 'This phone number is already registered.' }],
                );
            }
        }

        const hashedPassword = await bcrypt.hash(data.password_hash, 10);
        const user = await createUserAccount({ ...data, role: normalizedRole, password_hash: hashedPassword });
        const tokens = await this.generateTokens(user);
        return { user: this.sanitizeUser(user), ...tokens };
    },

    async initiateSignupVerification(data: User): Promise<any> {
        assertIndianPhone(data.phone || '');

        const normalizedRole = normalizeRoleValue(data.role) as User['role'];

        const existingUser = await UserModel.findByEmail(data.email);
        if (existingUser) {
            throw createAppError(
                'This email is already registered. Please log in.',
                409,
                [{ field: 'email', message: 'This email is already registered.' }],
            );
        }

        const existingPhoneUser = await UserModel.findByPhone(data.phone!);
        if (existingPhoneUser) {
            throw createAppError(
                'This phone number is already registered. Please log in.',
                409,
                [{ field: 'phone', message: 'This phone number is already registered.' }],
            );
        }

        await AuthOtpSessionModel.deleteExpired();
        await AuthOtpSessionModel.deleteByPurposeAndIdentity('signup', {
            email: data.email,
            phone: data.phone,
        });

        const hashedPassword = await bcrypt.hash(data.password_hash, 10);
        const sessionToken = randomUUID().replace(/-/g, '');
        const expiresAt = buildExpiryDate(SESSION_EXPIRY_MS);

        await AuthOtpSessionModel.create({
            session_token: sessionToken,
            purpose: 'signup',
            role: normalizedRole,
            user_id: null,
            created_user_id: null,
            full_name: data.full_name,
            email: data.email,
            phone: data.phone!,
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

        const session = await AuthOtpSessionModel.findBySessionToken(sessionToken);
        const activeSession = assertValidSession(session, 'signup');

        try {
            await sendOtpForSession(activeSession, 'email', 'email verification');
        } catch (error) {
            await AuthOtpSessionModel.deleteBySessionToken(sessionToken);
            throw error;
        }

        const updatedSession = await AuthOtpSessionModel.findBySessionToken(sessionToken);
        return buildOtpSessionPayload(assertValidSession(updatedSession, 'signup'), 'signup', 'email', 'sms');
    },

    async verifySignupOtp(sessionToken: string, channel: 'email' | 'sms', otp: string): Promise<any> {
        const session = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');

        if (channel === 'sms' && !session.email_verified) {
            throw createAppError(
                'Please verify your email OTP first.',
                400,
                [{ field: 'channel', message: 'Please verify your email OTP first.' }],
            );
        }

        const isValid = await verifySessionOtp(session, channel, otp);
        if (!isValid) {
            throw createAppError(
                'Invalid OTP. Please try again.',
                400,
                [{ field: 'otp', message: 'Invalid OTP. Please try again.' }],
            );
        }

        const updatedSession = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
        return await finalizeSignupIfReady(updatedSession);
    },

    async verifySignupFirebaseSms(sessionToken: string, firebaseIdToken: string): Promise<any> {
        const session = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');

        if (!session.email_verified) {
            throw createAppError(
                'Please verify your email OTP first.',
                400,
                [{ field: 'channel', message: 'Please verify your email OTP first.' }],
            );
        }

        const { phoneNumber } = await FirebaseAdminService.verifyPhoneIdToken(firebaseIdToken);
        const normalizedFirebasePhone = normalizeFirebasePhone(phoneNumber);

        if (normalizedFirebasePhone !== session.phone) {
            throw createAppError(
                'This SMS verification does not match the signup phone number.',
                400,
                [{ field: 'firebaseIdToken', message: 'This SMS verification does not match the signup phone number.' }],
            );
        }

        if (!session.sms_verified) {
            await AuthOtpSessionModel.markChannelVerified(session.session_token, 'sms');
        }

        const updatedSession = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
        return await finalizeSignupIfReady(updatedSession);
    },

    async resendSignupOtp(sessionToken: string, channel: 'email' | 'sms'): Promise<any> {
        const session = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');

        if (channel === 'sms' && !session.email_verified) {
            throw createAppError(
                'Please verify your email OTP first.',
                400,
                [{ field: 'channel', message: 'Please verify your email OTP first.' }],
            );
        }

        if (channel === 'sms') {
            return buildOtpSessionPayload(session, 'signup', 'sms');
        }

        await sendOtpForSession(session, channel, channel === 'email' ? 'email verification' : 'mobile verification');

        const updatedSession = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'signup');
        return buildOtpSessionPayload(
            updatedSession,
            'signup',
            channel === 'email' ? 'email' : 'sms',
            channel === 'email' && !updatedSession.sms_verified ? 'sms' : undefined
        );
    },

    async login(
        email: string,
        password: string,
        role: 'customer' | 'technician' | 'dealer' | 'admin'
    ): Promise<any> {
        const user = await UserModel.findByEmail(email);

        if (!user) {
            throw createAppError(
                'Account not found. Please sign up.',
                404,
                [{ field: 'email', message: 'No account found with this email.' }],
            );
        }

        if (!isRoleAllowedForUser(user, role)) {
            throw createAppError(
                `No ${role} account found with this email.`,
                404,
                [{ field: 'email', message: `No ${role} account found with this email.` }],
            );
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            throw createAppError(
                'Incorrect password. Please try again.',
                401,
                [{ field: 'password', message: 'Incorrect password. Please try again.' }],
            );
        }

        const tokens = await this.generateTokens(user);
        return { user: this.sanitizeUser(user), ...tokens };
    },

    async initiateLoginOtp(phone: string, role: 'customer' | 'technician' | 'dealer'): Promise<any> {
        assertIndianPhone(phone);

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            throw createAppError(
                'No account found for this phone number.',
                404,
                [{ field: 'phone', message: 'No account found for this phone number.' }],
            );
        }

        if (!isRoleAllowedForUser(user, role)) {
            throw createAppError(
                `No ${role} account found for this phone number.`,
                404,
                [{ field: 'phone', message: `No ${role} account found for this phone number.` }],
            );
        }

        if (!user.email) {
            throw createAppError(
                'This account does not have a registered email. Please use password login.',
                400,
                [{ field: 'phone', message: 'This account does not have a registered email. Please use password login.' }],
            );
        }

        await AuthOtpSessionModel.deleteExpired();
        await AuthOtpSessionModel.deleteByPurposeAndIdentity('login', {
            userId: user.id,
            phone,
        });

        const sessionToken = randomUUID().replace(/-/g, '');
        const expiresAt = buildExpiryDate(SESSION_EXPIRY_MS);

        await AuthOtpSessionModel.create({
            session_token: sessionToken,
            purpose: 'login',
            role: normalizeRoleValue(user.role),
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

        const session = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
        try {
            await sendOtpForSession(session, 'email', 'login');
        } catch (error) {
            await AuthOtpSessionModel.deleteBySessionToken(sessionToken);
            throw error;
        }

        const updatedSession = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
        return buildOtpSessionPayload(updatedSession, 'login', 'email');
    },

    async resendLoginOtp(sessionToken: string, channel: AuthOtpChannel): Promise<any> {
        const session = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
        await sendOtpForSession(session, channel, channel === 'email' ? 'login' : 'WhatsApp login');

        const updatedSession = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');
        return buildOtpSessionPayload(updatedSession, 'login', channel);
    },

    async verifyLoginOtp(sessionToken: string, channel: AuthOtpChannel, otp: string): Promise<any> {
        const session = assertValidSession(await AuthOtpSessionModel.findBySessionToken(sessionToken), 'login');

        const isValid = await verifySessionOtp(session, channel, otp);
        if (!isValid) {
            throw createAppError(
                'Invalid OTP. Please try again.',
                400,
                [{ field: 'otp', message: 'Invalid OTP. Please try again.' }],
            );
        }

        const user = session.user_id
            ? await UserModel.findById(session.user_id)
            : await UserModel.findByPhone(session.phone);

        if (!user) {
            throw createAppError(
                'No account found for this phone number.',
                404,
                [{ field: 'phone', message: 'No account found for this phone number.' }],
            );
        }

        const tokens = await this.generateTokens(user);
        return { user: this.sanitizeUser(user), ...tokens };
    },

    async refreshToken(token: string): Promise<any> {
        const session = await UserModel.findSessionByToken(token);
        if (!session) {
            throw { type: 'AppError', message: 'Invalid or expired refresh token', statusCode: 401 };
        }

        const user = await UserModel.findById(session.user_id);
        if (!user) {
            throw { type: 'AppError', message: 'User not found', statusCode: 404 };
        }

        await UserModel.revokeSession(token);

        const tokens = await this.generateTokens(user);
        return { ...tokens };
    },

    async logout(token: string): Promise<void> {
        await UserModel.revokeSession(token);
    },

    async generateTokens(user: User) {
        const normalizedRole = normalizeRoleValue(user.role);
        const accessToken = jwt.sign(
            { id: user.id, role: normalizedRole, email: user.email },
            env.JWT_SECRET,
            { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions
        );

        const refreshToken = jwt.sign(
            { id: user.id, jti: randomUUID() },
            env.JWT_REFRESH_SECRET,
            { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await UserModel.createSession(user.id!, refreshToken, undefined, undefined, expiresAt);

        return { accessToken, refreshToken };
    },

    sanitizeUser(user: User) {
        const { password_hash, ...rest } = user;
        return {
            ...rest,
            role: normalizeRoleValue(rest.role),
        };
    },

    async sendOTP(phone: string): Promise<void> {
        assertIndianPhone(phone);

        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = buildExpiryDate(OTP_EXPIRY_MS);

        await OtpModel.create(phone, otpHash, expiresAt);
        await SmsService.sendOTP(phone, otp);
    },

    async verifyOTP(phone: string, otp: string): Promise<boolean> {
        const record = await OtpModel.findLatestByPhone(phone);

        if (!record || record.verified) {
            throw createAppError(
                'OTP not found. Request a new one.',
                400,
                [{ field: 'otp', message: 'OTP not found. Request a new one.' }],
            );
        }

        if (record.expires_at < new Date()) {
            throw createAppError(
                'OTP expired. Request a new one.',
                400,
                [{ field: 'otp', message: 'OTP expired. Request a new one.' }],
            );
        }

        if (record.attempts >= MAX_OTP_ATTEMPTS) {
            throw createAppError(
                'Too many attempts. Request a new OTP.',
                429,
                [{ field: 'otp', message: 'Too many attempts. Request a new OTP.' }],
            );
        }

        const isMatch = await bcrypt.compare(otp, record.otp_hash);

        if (!isMatch) {
            await OtpModel.incrementAttempts(record.id);
            return false;
        }

        await OtpModel.markVerified(record.id);
        return true;
    },

    async initiateForgotPassword(email: string): Promise<void> {
        const user = await UserModel.findByEmail(email);
        if (!user || !user.id) return;

        const token = randomBytes(32).toString('hex');
        const hashedToken = createHash('sha256').update(token).digest('hex');
        const expires = new Date(Date.now() + 15 * 60 * 1000);

        await UserModel.setResetToken(user.id, hashedToken, expires);

        const resetLink = `${env.BASE_SERVER_URL}/reset-password?token=${token}`;
        await EmailService.sendPasswordReset(email, resetLink);
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const hashedToken = createHash('sha256').update(token).digest('hex');
        const user = await UserModel.findByResetToken(hashedToken);

        if (!user || !user.id) {
            throw { type: 'AppError', message: 'Invalid or expired reset link', statusCode: 400 };
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await UserModel.update(user.id, { password_hash: newHash });
        await UserModel.clearResetToken(user.id);
    },

    async loginWithOTP(phone: string, otp: string): Promise<any> {
        const isValid = await this.verifyOTP(phone, otp);

        if (!isValid) {
            throw createAppError(
                'Invalid OTP. Please try again.',
                400,
                [{ field: 'otp', message: 'Invalid OTP. Please try again.' }],
            );
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            throw createAppError(
                'No account found for this phone number.',
                404,
                [{ field: 'phone', message: 'No account found for this phone number.' }],
            );
        }

        const tokens = await this.generateTokens(user);
        return { user: this.sanitizeUser(user), ...tokens };
    },
};
