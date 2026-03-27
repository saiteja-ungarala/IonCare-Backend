import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { PaymentService } from '../services/payment.service';
import { PaymentModel } from '../models/payment.model';
import { BookingService } from '../services/bookings.service';
import { successResponse, errorResponse } from '../utils/response';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Look up the authoritative amount for a payment entity from the database.
 * Returns null if the entity doesn't exist or doesn't belong to userId.
 *
 * This prevents clients from sending a tampered (e.g. ₹1) amount for a
 * booking or order that actually costs more.
 */
async function resolveEntityAmount(
    entity_type: 'booking' | 'order',
    entity_id: number,
    userId: number,
): Promise<number | null> {
    if (entity_type === 'booking') {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT price FROM bookings WHERE id = ? AND user_id = ?',
            [entity_id, userId],
        );
        if (!rows.length) return null;
        return Number(rows[0].price);
    }

    if (entity_type === 'order') {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT total_amount FROM orders WHERE id = ? AND user_id = ?',
            [entity_id, userId],
        );
        if (!rows.length) return null;
        return Number(rows[0].total_amount);
    }

    return null;
}

// ── Controllers ──────────────────────────────────────────────────────────────

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const { entity_type, entity_id } = req.body;

        if (!entity_type || !entity_id) {
            return errorResponse(res, 'entity_type and entity_id are required', 400);
        }
        if (!['booking', 'order'].includes(entity_type)) {
            return errorResponse(res, 'entity_type must be booking or order', 400);
        }

        // Resolve the authoritative amount server-side.
        // The client-supplied `amount` field is intentionally ignored to prevent
        // price tampering (e.g. sending amount=1 for a ₹500 booking).
        const amount = await resolveEntityAmount(entity_type, Number(entity_id), userId);
        if (amount === null) {
            return errorResponse(res, `${entity_type === 'booking' ? 'Booking' : 'Order'} not found`, 404);
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
            amount: razorpayOrder.amount,
            currency: 'INR',
            key: env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        next(error);
    }
};

export const verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as any).id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return errorResponse(res, 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required', 400);
        }

        const payment = await PaymentModel.findByRazorpayOrderId(razorpay_order_id);
        if (!payment) {
            return errorResponse(res, 'Payment not found', 404);
        }

        // Ownership check — prevent one user from confirming another user's payment
        if (payment.user_id !== userId) {
            return errorResponse(res, 'Forbidden', 403);
        }

        if (payment.status === 'paid') {
            // Idempotent: already processed — return success instead of an error
            return successResponse(res, { success: true });
        }

        const isValid = PaymentService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (!isValid) {
            return errorResponse(res, 'Invalid signature', 400);
        }

        await PaymentModel.markPaid(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (payment.entity_type === 'booking') {
            const [result] = await pool.query<ResultSetHeader>(
                'UPDATE bookings SET status = ? WHERE id = ? AND status = ?',
                ['confirmed', payment.entity_id, 'pending']
            );
            if (result.affectedRows > 0) {
                BookingService.fanOutToNearbyTechnicians(payment.entity_id).catch((err) =>
                    console.error('[verifyPayment] fanOut error:', err)
                );
            }
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
                        const [result] = await pool.query<ResultSetHeader>(
                            'UPDATE bookings SET status = ? WHERE id = ? AND status = ?',
                            ['confirmed', payment.entity_id, 'pending']
                        );
                        if (result.affectedRows > 0) {
                            BookingService.fanOutToNearbyTechnicians(payment.entity_id).catch((err) =>
                                console.error('[webhook] fanOut error:', err)
                            );
                        }
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
                    [refundEntity.payment_id],
                );
            }
        }
    } catch (err) {
        // Webhook handler must never throw — Razorpay expects a 200 even on errors.
        // Log the error for observability but do not propagate it.
        console.error('[Webhook] unhandled error:', err);
    }

    return res.status(200).json({ received: true });
};
