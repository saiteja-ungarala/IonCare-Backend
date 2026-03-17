// import Razorpay from 'razorpay';  // DISABLED — Razorpay key not configured
import crypto from 'crypto';
import { env } from '../config/env';

// DISABLED — Razorpay instance commented out until key is configured
// const razorpay = new Razorpay({
//     key_id: env.RAZORPAY_KEY_ID,
//     key_secret: env.RAZORPAY_KEY_SECRET,
// });

export const PaymentService = {
    async createOrder(amount: number, currency: string, receipt: string): Promise<{ id: string; amount: number; currency: string }> {
        // DISABLED — Razorpay order creation commented out until key is configured
        // const order = await razorpay.orders.create({
        //     amount: Math.round(amount * 100), // rupees to paise
        //     currency,
        //     receipt,
        // });
        // return { id: order.id, amount: order.amount as number, currency: order.currency };
        console.warn('[PaymentService] Razorpay disabled — returning stub order');
        return { id: `DISABLED_${receipt}`, amount, currency };
    },

    verifySignature(orderId: string, paymentId: string, signature: string): boolean {
        // DISABLED — Razorpay signature verification commented out until key is configured
        // const computed = crypto
        //     .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        //     .update(orderId + '|' + paymentId)
        //     .digest('hex');
        // return computed === signature;
        console.warn('[PaymentService] Razorpay disabled — signature verification skipped');
        return false;
    },

    verifyWebhookSignature(body: string, signature: string): boolean {
        // DISABLED — Razorpay webhook verification commented out until key is configured
        // const computed = crypto
        //     .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
        //     .update(body)
        //     .digest('hex');
        // return computed === signature;
        console.warn('[PaymentService] Razorpay disabled — webhook verification skipped');
        return false;
    },
};
