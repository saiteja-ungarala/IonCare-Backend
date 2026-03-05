import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';

export interface Payment {
    id: number;
    user_id: number;
    razorpay_order_id: string;
    razorpay_payment_id: string | null;
    razorpay_signature: string | null;
    amount: number;
    currency: string;
    status: 'created' | 'paid' | 'failed' | 'refunded';
    entity_type: 'booking' | 'order';
    entity_id: number;
    failure_reason: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreatePaymentInput {
    user_id: number;
    razorpay_order_id: string;
    amount: number;
    currency?: string;
    status?: 'created' | 'paid' | 'failed' | 'refunded';
    entity_type: 'booking' | 'order';
    entity_id: number;
    razorpay_payment_id?: string | null;
    razorpay_signature?: string | null;
    failure_reason?: string | null;
}

export const PaymentModel = {
    async create(data: CreatePaymentInput): Promise<number> {
        const [result] = await pool.query<ResultSetHeader>(
            `INSERT INTO payments (
                user_id, razorpay_order_id, razorpay_payment_id, razorpay_signature,
                amount, currency, status, entity_type, entity_id, failure_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.user_id,
                data.razorpay_order_id,
                data.razorpay_payment_id ?? null,
                data.razorpay_signature ?? null,
                data.amount,
                data.currency ?? 'INR',
                data.status ?? 'created',
                data.entity_type,
                data.entity_id,
                data.failure_reason ?? null,
            ]
        );

        return result.insertId;
    },

    async findByRazorpayOrderId(orderId: string): Promise<Payment | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, user_id, razorpay_order_id, razorpay_payment_id, razorpay_signature,
                    amount, currency, status, entity_type, entity_id, failure_reason, created_at, updated_at
             FROM payments
             WHERE razorpay_order_id = ?
             LIMIT 1`,
            [orderId]
        );

        return (rows[0] as Payment) || null;
    },

    async markPaid(razorpayOrderId: string, paymentId: string, signature: string): Promise<void> {
        await pool.query(
            `UPDATE payments
             SET status = 'paid',
                 razorpay_payment_id = ?,
                 razorpay_signature = ?,
                 failure_reason = NULL
             WHERE razorpay_order_id = ?`,
            [paymentId, signature, razorpayOrderId]
        );
    },

    async markFailed(razorpayOrderId: string, reason: string): Promise<void> {
        await pool.query(
            `UPDATE payments
             SET status = 'failed',
                 failure_reason = ?
             WHERE razorpay_order_id = ?`,
            [reason, razorpayOrderId]
        );
    },
};

