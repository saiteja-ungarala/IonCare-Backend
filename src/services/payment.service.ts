import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config/env';

const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
});

export const PaymentService = {
    async createOrder(amount: number, currency: string, receipt: string): Promise<{ id: string; amount: number; currency: string }> {
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // rupees to paise
            currency,
            receipt,
        });
        return { id: order.id, amount: order.amount as number, currency: order.currency };
    },

    verifySignature(orderId: string, paymentId: string, signature: string): boolean {
        const computed = crypto
            .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
            .update(orderId + '|' + paymentId)
            .digest('hex');
        return computed === signature;
    },

    verifyWebhookSignature(body: string, signature: string): boolean {
        const computed = crypto
            .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest('hex');
        return computed === signature;
    },
};
