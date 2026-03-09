import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { env } from '../config/env';
import { PaymentService } from '../services/payment.service';
import { PaymentModel } from '../models/payment.model';
import { successResponse, errorResponse } from '../utils/response';

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const { amount, entity_type, entity_id } = req.body;

        if (!amount || !entity_type || !entity_id) {
            return errorResponse(res, 'amount, entity_type and entity_id are required', 400);
        }
        if (!['booking', 'order'].includes(entity_type)) {
            return errorResponse(res, 'entity_type must be booking or order', 400);
        }

        const receipt = `${entity_type}_${entity_id}_${Date.now()}`;
        const razorpayOrder = await PaymentService.createOrder(amount, 'INR', receipt);

        await PaymentModel.create({
            user_id: userId,
            razorpay_order_id: razorpayOrder.id,
            amount,
            currency: 'INR',
            status: 'created',
            entity_type,
            entity_id: Number(entity_id),
        });

        return successResponse(res, {
            razorpay_order_id: razorpayOrder.id,
            amount,
            currency: 'INR',
            key: env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        next(error);
    }
};

export const verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return errorResponse(res, 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required', 400);
        }

        const payment = await PaymentModel.findByRazorpayOrderId(razorpay_order_id);
        if (!payment) {
            return errorResponse(res, 'Payment not found', 404);
        }

        if (payment.status === 'paid') {
            return errorResponse(res, 'Already processed', 400);
        }

        const isValid = PaymentService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (!isValid) {
            return errorResponse(res, 'Invalid signature', 400);
        }

        await PaymentModel.markPaid(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (payment.entity_type === 'booking') {
            await pool.query('UPDATE bookings SET status = ? WHERE id = ?', ['confirmed', payment.entity_id]);
        } else if (payment.entity_type === 'order') {
            await pool.query('UPDATE orders SET status = ? WHERE id = ?', ['paid', payment.entity_id]);
        }

        return successResponse(res, { success: true });
    } catch (error) {
        next(error);
    }
};

export const webhook = async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        // req.body is raw Buffer when using express.raw() on this route
        const rawBody = (req as any).rawBody as string;

        if (!signature || !rawBody) {
            return res.status(200).json({ received: true });
        }

        const isValid = PaymentService.verifyWebhookSignature(rawBody, signature);
        if (!isValid) {
            return res.status(200).json({ received: true });
        }

        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const eventType: string = event?.event ?? '';

        if (eventType === 'payment.captured') {
            const paymentEntity = event.payload?.payment?.entity;
            if (paymentEntity?.order_id) {
                const payment = await PaymentModel.findByRazorpayOrderId(paymentEntity.order_id);
                if (payment && payment.status !== 'paid') {
                    await PaymentModel.markPaid(paymentEntity.order_id, paymentEntity.id, '');
                    if (payment.entity_type === 'booking') {
                        await pool.query('UPDATE bookings SET status = ? WHERE id = ?', ['confirmed', payment.entity_id]);
                    } else if (payment.entity_type === 'order') {
                        await pool.query('UPDATE orders SET status = ? WHERE id = ?', ['paid', payment.entity_id]);
                    }
                }
            }
        } else if (eventType === 'payment.failed') {
            const paymentEntity = event.payload?.payment?.entity;
            if (paymentEntity?.order_id) {
                await PaymentModel.markFailed(paymentEntity.order_id, paymentEntity.error_description ?? 'Payment failed');
            }
        } else if (eventType === 'refund.created') {
            const refundEntity = event.payload?.refund?.entity;
            if (refundEntity?.payment_id) {
                await pool.query(
                    `UPDATE payments SET status = 'refunded' WHERE razorpay_payment_id = ?`,
                    [refundEntity.payment_id]
                );
            }
        }
    } catch (_err) {
        // Webhook handler must never fail
    }

    return res.status(200).json({ received: true });
};
