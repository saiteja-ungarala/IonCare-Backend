import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/db';

export interface UserBenefit {
    id: number;
    user_id: number;
    benefit_code: string;
    status: 'unused' | 'used' | 'revoked';
    granted_at: Date;
    used_at: Date | null;
    used_booking_id: number | null;
}

export const UserBenefitModel = {
    async findByUserAndCode(userId: number, benefitCode: string): Promise<UserBenefit | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, user_id, benefit_code, status, granted_at, used_at, used_booking_id
             FROM user_benefits
             WHERE user_id = ? AND benefit_code = ?
             LIMIT 1`,
            [userId, benefitCode]
        );

        return (rows[0] as UserBenefit) || null;
    },

    async markUsed(id: number, bookingId: number, connection?: PoolConnection): Promise<void> {
        if (connection) {
            await connection.query(
                `UPDATE user_benefits
                 SET status = 'used', used_at = NOW(), used_booking_id = ?
                 WHERE id = ?`,
                [bookingId, id]
            );
            return;
        }

        await pool.query(
            `UPDATE user_benefits
             SET status = 'used', used_at = NOW(), used_booking_id = ?
             WHERE id = ?`,
            [bookingId, id]
        );
    },

    async create(userId: number, benefitCode: string): Promise<void> {
        await pool.query(
            `INSERT IGNORE INTO user_benefits (user_id, benefit_code, status)
             VALUES (?, ?, 'unused')`,
            [userId, benefitCode]
        );
    },
};

