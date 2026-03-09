import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { UserModel, User } from '../models/user.model';
import { WalletModel } from '../models/wallet.model';
import { UserBenefitModel } from '../models/user-benefit.model';
import { OtpModel } from '../models/otp.model';
import { SmsService } from './sms.service';
import { EmailService } from './email.service';
import { env } from '../config/env';

export const AuthService = {
    async signup(data: User): Promise<any> {
        const existingUser = await UserModel.findByEmail(data.email);
        if (existingUser) {
            throw { type: 'AppError', message: 'Email already exists', statusCode: 409 };
        }

        const hashedPassword = await bcrypt.hash(data.password_hash, 10);
        const userId = await UserModel.create({ ...data, password_hash: hashedPassword });

        // Wallet setup + welcome bonus
        await WalletModel.createWallet(userId);
        await WalletModel.creditWithIdempotency(userId, {
            amount: 1000,
            txn_type: 'credit',
            source: 'welcome_bonus',
            idempotency_key: `welcome:${userId}`,
        });

        // First Service Free benefit for new customers
        if (data.role === 'customer') {
            await UserBenefitModel.create(userId, 'FIRST_SERVICE_FREE');
        }

        const user = await UserModel.findById(userId);

        const tokens = await this.generateTokens(user!);
        return { user: this.sanitizeUser(user!), ...tokens };
    },

    async login(email: string, password: string, role?: 'customer' | 'agent' | 'dealer'): Promise<any> {
        const user = await UserModel.findByEmail(email);

        // User not found - return 404
        if (!user) {
            throw { type: 'AppError', message: 'User not found', statusCode: 404 };
        }

        // Enforce selected role login. If mismatch, do not allow cross-role login.
        if (role && user.role !== role) {
            throw { type: 'AppError', message: 'Credentials not found', statusCode: 404 };
        }

        // Wrong password - return 401
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            throw { type: 'AppError', message: 'Invalid password', statusCode: 401 };
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

        // Revoke old token (Rotation)
        await UserModel.revokeSession(token);

        const tokens = await this.generateTokens(user);
        return { ...tokens };
    },

    async logout(token: string): Promise<void> {
        await UserModel.revokeSession(token);
    },

    async generateTokens(user: User) {
        const accessToken = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            env.JWT_SECRET,
            { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions
        );

        const refreshToken = jwt.sign(
            { id: user.id, jti: randomUUID() },
            env.JWT_REFRESH_SECRET,
            { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions
        );

        // Store refresh token in DB
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
        await UserModel.createSession(user.id!, refreshToken, undefined, undefined, expiresAt);

        return { accessToken, refreshToken };
    },

    sanitizeUser(user: User) {
        const { password_hash, ...rest } = user;
        return rest;
    },

    async sendOTP(phone: string): Promise<void> {
        if (!/^\d{10}$/.test(phone)) {
            throw { type: 'AppError', message: 'Phone number must be exactly 10 digits', statusCode: 400 };
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OtpModel.create(phone, otpHash, expiresAt);
        await SmsService.sendOTP(phone, otp);
        // OTP is never logged or returned
    },

    async verifyOTP(phone: string, otp: string): Promise<boolean> {
        const record = await OtpModel.findLatestByPhone(phone);

        if (!record || record.verified) {
            throw { type: 'AppError', message: 'OTP not found. Request a new one.', statusCode: 400 };
        }

        if (record.expires_at < new Date()) {
            throw { type: 'AppError', message: 'OTP expired. Request a new one.', statusCode: 400 };
        }

        if (record.attempts >= 5) {
            throw { type: 'AppError', message: 'Too many attempts. Request new OTP.', statusCode: 429 };
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
        if (!user || !user.id) return; // silently do nothing if not found

        const token = randomBytes(32).toString('hex');
        const hashedToken = createHash('sha256').update(token).digest('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await UserModel.setResetToken(user.id, hashedToken, expires);

        const resetLink = `${env.BASE_SERVER_URL}/reset-password?token=${token}`;
        EmailService.sendPasswordReset(email, resetLink); // fire-and-forget
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
            throw { type: 'AppError', message: 'Invalid OTP', statusCode: 400 };
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            throw { type: 'AppError', message: 'No account found for this phone number', statusCode: 404 };
        }

        const tokens = await this.generateTokens(user);
        return { user: this.sanitizeUser(user), ...tokens };
    },
};
