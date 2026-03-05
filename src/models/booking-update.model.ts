import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';

export interface BookingUpdate {
    id: number;
    booking_id: number;
    agent_id: number;
    update_type: 'arrived' | 'diagnosed' | 'in_progress' | 'completed' | 'photo' | 'note';
    note: string | null;
    media_url: string | null;
    created_at: Date;
}

export const BookingUpdateModel = {
    async create(data: Omit<BookingUpdate, 'id' | 'created_at'>): Promise<number> {
        const [result] = await pool.query<ResultSetHeader>(
            `INSERT INTO booking_updates (booking_id, agent_id, update_type, note, media_url)
             VALUES (?, ?, ?, ?, ?)`,
            [data.booking_id, data.agent_id, data.update_type, data.note, data.media_url]
        );

        return result.insertId;
    },

    async findByBookingId(bookingId: number): Promise<BookingUpdate[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, booking_id, agent_id, update_type, note, media_url, created_at
             FROM booking_updates
             WHERE booking_id = ?
             ORDER BY created_at ASC, id ASC`,
            [bookingId]
        );

        return rows as BookingUpdate[];
    },
};

