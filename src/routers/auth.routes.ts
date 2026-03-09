import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { SignupSchema, LoginSchema, RefreshSchema, SendOtpSchema, VerifyOtpSchema, ResetPasswordSchema } from '../dto/auth.dto';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

router.post('/signup', validate(SignupSchema), AuthController.signup);
router.post('/login', validate(LoginSchema), AuthController.login);
router.post('/refresh', validate(RefreshSchema), AuthController.refresh);
router.post('/logout', authenticate, AuthController.logout);
router.post('/forgot-password', AuthController.forgotPassword);
router.get('/me', authenticate, AuthController.me);
router.post('/send-otp', validate(SendOtpSchema), AuthController.sendOtp);
router.post('/verify-otp', validate(VerifyOtpSchema), AuthController.verifyOtp);
router.post('/reset-password', validate(ResetPasswordSchema), AuthController.resetPassword);

export default router;
