import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UserModel } from '../models/user.model';
import { WalletModel } from '../models/wallet.model';
import { successResponse } from '../utils/response';

export const signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await AuthService.signup({
            ...req.body,
            password_hash: req.body.password
        });
        return successResponse(res, result, 'User created successfully', 201);
    } catch (error) {
        next(error);
    }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await AuthService.login(req.body.email, req.body.password, req.body.role);
        return successResponse(res, result, 'Login successful');
    } catch (error) {
        next(error);
    }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await AuthService.refreshToken(req.body.refreshToken);
        return successResponse(res, result, 'Token refreshed');
    } catch (error) {
        next(error);
    }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Expect refresh token in body for now, to revoke specific session
        await AuthService.logout(req.body.refreshToken);
        return successResponse(res, null, 'Logged out successfully');
    } catch (error) {
        next(error);
    }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;

        // Fetch full user from DB
        const user = await UserModel.findById(userId);
        if (!user) {
            throw { type: 'AppError', message: 'User not found', statusCode: 404 };
        }

        // Ensure wallet exists for user
        await WalletModel.createWallet(userId);

        // Return sanitized user with camelCase fields
        const sanitizedUser = {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            phone: user.phone || null,
            role: user.role,
            referralCode: (user as any).referral_code || null,
        };

        return successResponse(res, { user: sanitizedUser });
    } catch (error) {
        next(error);
    }
};

export const forgotPassword = async (req: Request, res: Response, _next: NextFunction) => {
    const { email } = req.body;
    // Fire-and-forget — never await, never reveal if email exists
    AuthService.initiateForgotPassword(email).catch((err) =>
        console.error('[Auth] forgotPassword error:', err)
    );
    return successResponse(res, null, 'If that email exists a reset link was sent');
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { token, newPassword } = req.body;
        await AuthService.resetPassword(token, newPassword);
        return successResponse(res, null, 'Password reset successfully');
    } catch (error) {
        next(error);
    }
};

export const sendOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone } = req.body;
        await AuthService.sendOTP(phone);
        return successResponse(res, null, 'OTP sent');
    } catch (error) {
        next(error);
    }
};

export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, otp } = req.body;
        const result = await AuthService.loginWithOTP(phone, otp);
        return successResponse(res, result, 'Login successful');
    } catch (error) {
        next(error);
    }
};
