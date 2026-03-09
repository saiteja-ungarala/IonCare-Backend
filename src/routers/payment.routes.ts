import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as PaymentController from '../controllers/payment.controller';

const router = Router();

// Webhook — raw body needed for signature verification, no auth
router.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    (req: Request, _res: Response, next: NextFunction) => {
        // Attach raw body string for signature verification
        (req as any).rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
        // Parse body back to object for event processing
        try {
            if (req.body instanceof Buffer) {
                req.body = JSON.parse((req as any).rawBody);
            }
        } catch (_) { /* leave body as-is */ }
        next();
    },
    PaymentController.webhook
);

// Authenticated routes
router.post('/create-order', authenticate, PaymentController.createOrder);
router.post('/verify', authenticate, PaymentController.verifyPayment);

export default router;
