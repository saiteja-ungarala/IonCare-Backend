import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import crypto from 'crypto';

export interface User {
    id?: number;
    role: 'customer' | 'agent' | 'dealer' | 'admin';
    full_name: string;
    email: string;
    phone?: string;
    password_hash: string;
    referral_code?: string;
    referred_by?: number;
    is_active?: boolean;
    created_at?: Date;
    updated_at?: Date;
}

/** Generate a unique referral code like AQ1X3K7P */
export function generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
    let code = 'AQ';
    for (let i = 0; i < 6; i++) {
        code += chars[crypto.randomInt(chars.length)];
    }
    return code;
}

export const UserModel = {
    async create(user: User): Promise<number> {
        const referralCode = user.referral_code || generateReferralCode();
        const [result] = await pool.query<ResultSetHeader>(
            `INSERT INTO users (role, full_name, email, phone, password_hash, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.role, user.full_name, user.email, user.phone, user.password_hash, referralCode, user.referred_by || null]
        );
        return result.insertId;
    },

    async findByEmail(email: string): Promise<User | null> {
        const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
        return (rows[0] as User) || null;
    },

    async findById(id: number): Promise<User | null> {
        const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [id]);
        return (rows[0] as User) || null;
    },

    async update(id: number, data: Partial<User>): Promise<void> {
        const fields = Object.keys(data).map((key) => `${key} = ?`).join(', ');
        const values = Object.values(data);
        await pool.query(`UPDATE users SET ${fields} WHERE id = ?`, [...values, id]);
    },

    // Auth Session Methods
    async createSession(userId: number, refreshToken: string, userAgent?: string, ip?: string, expiresAt?: Date): Promise<void> {
        await pool.query(
            `INSERT INTO auth_sessions (user_id, refresh_token, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [userId, refreshToken, userAgent, ip, expiresAt]
        );
    },

    async findSessionByToken(refreshToken: string): Promise<any> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM auth_sessions WHERE refresh_token = ? AND revoked_at IS NULL AND expires_at > NOW()',
            [refreshToken]
        );
        return rows[0] || null;
    },

    async revokeSession(refreshToken: string): Promise<void> {
        await pool.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE refresh_token = ?', [refreshToken]);
    },

    async revokeAllUserSessions(userId: number): Promise<void> {
        await pool.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ?', [userId]);
    }
};
