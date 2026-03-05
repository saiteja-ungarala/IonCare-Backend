import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { UserModel, User } from '../models/user.model';
import { env } from '../config/env';

export const AuthService = {
    async signup(data: User): Promise<any> {
        const existingUser = await UserModel.findByEmail(data.email);
        if (existingUser) {
            throw { type: 'AppError', message: 'Email already exists', statusCode: 409 };
        }

        const hashedPassword = await bcrypt.hash(data.password_hash, 10);
        const userId = await UserModel.create({ ...data, password_hash: hashedPassword });
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
};
