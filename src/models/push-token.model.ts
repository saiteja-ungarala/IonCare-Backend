import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

export interface PushToken {
    id: number;
    user_id: number;
    token: string;
    platform: 'ios' | 'android' | 'web';
    created_at: Date;
    updated_at: Date;
}

export const PushTokenModel = {
    async upsert(userId: number, token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
        await pool.query(
            `INSERT INTO push_tokens (user_id, token, platform)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                platform = VALUES(platform),
                updated_at = CURRENT_TIMESTAMP`,
            [userId, token, platform]
        );
    },

    async findByUserId(userId: number): Promise<PushToken[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, user_id, token, platform, created_at, updated_at
             FROM push_tokens
             WHERE user_id = ?
             ORDER BY updated_at DESC`,
            [userId]
        );

        return rows as PushToken[];
    },

    async deleteByToken(token: string): Promise<void> {
        await pool.query('DELETE FROM push_tokens WHERE token = ?', [token]);
    },
};

