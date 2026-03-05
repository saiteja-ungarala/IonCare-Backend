import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';

export type WalletTransactionType = 'credit' | 'debit';

export type WalletSource =
    | 'recharge'
    | 'booking_payment'
    | 'order_payment'
    | 'refund'
    | 'referral_bonus'
    | 'adjustment'
    | 'welcome_bonus'
    | 'commission';

export interface Wallet {
    user_id: number;
    balance: number;
    updated_at: Date;
}

export interface WalletTransaction {
    id?: number;
    user_id: number;
    txn_type: WalletTransactionType;
    source: WalletSource;
    reference_type: string;
    reference_id?: number;
    amount: number;
    description?: string;
    idempotency_key?: string | null;
    created_at?: Date;
}

export const WalletModel = {
    async getBalance(userId: number): Promise<number> {
        const [rows] = await pool.query<RowDataPacket[]>('SELECT balance FROM wallets WHERE user_id = ?', [userId]);
        return rows.length > 0 ? Number(rows[0].balance) : 0.00;
    },

    async createWallet(userId: number): Promise<void> {
        await pool.query('INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0.00)', [userId]);
    },

    async addTransaction(userId: number, txn: WalletTransaction): Promise<void> {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `INSERT INTO wallet_transactions (user_id, txn_type, source, reference_type, reference_id, amount, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, txn.txn_type, txn.source, txn.reference_type, txn.reference_id || null, txn.amount, txn.description || null]
            );

            const balanceChange = txn.txn_type === 'credit' ? txn.amount : -txn.amount;
            await connection.query(
                `INSERT INTO wallets (user_id, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?`,
                [userId, balanceChange, balanceChange]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    async getTransactions(userId: number, limit = 20, offset = 0): Promise<WalletTransaction[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [userId, limit, offset]
        );
        return rows as WalletTransaction[];
    },

    async creditWithIdempotency(
        userId: number,
        {
            amount,
            txn_type,
            source,
            idempotency_key,
        }: { amount: number; txn_type: WalletTransactionType; source: WalletSource; idempotency_key: string }
    ): Promise<void> {
        const connection: PoolConnection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [insertResult] = await connection.query<ResultSetHeader>(
                `INSERT IGNORE INTO wallet_transactions
                (user_id, txn_type, source, reference_type, amount, description, idempotency_key)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, txn_type, source, 'wallet', amount, 'Idempotent wallet transaction', idempotency_key]
            );

            if (insertResult.affectedRows > 0) {
                const balanceChange = txn_type === 'credit' ? amount : -amount;
                await connection.query(
                    'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                    [balanceChange, userId]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
};
