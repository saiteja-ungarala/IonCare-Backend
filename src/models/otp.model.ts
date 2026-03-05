import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

export interface OtpVerification {
    id: number;
    phone: string;
    otp_hash: string;
    expires_at: Date;
    verified: boolean;
    attempts: number;
    created_at: Date;
}

export const OtpModel = {
    async create(phone: string, otpHash: string, expiresAt: Date): Promise<void> {
        await pool.query(
            `INSERT INTO otp_verifications (phone, otp_hash, expires_at, verified, attempts)
             VALUES (?, ?, ?, 0, 0)`,
            [phone, otpHash, expiresAt]
        );
    },

    async findLatestByPhone(phone: string): Promise<OtpVerification | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, phone, otp_hash, expires_at, verified, attempts, created_at
             FROM otp_verifications
             WHERE phone = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [phone]
        );

        if (!rows[0]) {
            return null;
        }

        const row = rows[0];
        return {
            id: Number(row.id),
            phone: String(row.phone),
            otp_hash: String(row.otp_hash),
            expires_at: row.expires_at as Date,
            verified: Boolean(row.verified),
            attempts: Number(row.attempts),
            created_at: row.created_at as Date,
        };
    },

    async incrementAttempts(id: number): Promise<void> {
        await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?', [id]);
    },

    async markVerified(id: number): Promise<void> {
        await pool.query('UPDATE otp_verifications SET verified = 1 WHERE id = ?', [id]);
    },

    async deleteExpired(): Promise<void> {
        await pool.query('DELETE FROM otp_verifications WHERE expires_at < NOW()');
    },
};

