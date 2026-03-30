import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { BOOKING_STATUS } from '../config/constants';

export interface Booking {
    id: number;
    user_id: number;
    service_id: number;
    technician_id?: number | null;
    address_id?: number;
    scheduled_date: string;
    scheduled_time: string;
    time_slot_end?: string | null;
    status: string;
    price: number;
    notes?: string;
    assigned_at?: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at?: Date;
}

export const BookingModel = {
    async create(data: Partial<Booking>): Promise<number> {
        const [result] = await pool.query<ResultSetHeader>(
            `INSERT INTO bookings (user_id, service_id, address_id, scheduled_date, scheduled_time, status, price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.user_id, data.service_id, data.address_id || null, data.scheduled_date, data.scheduled_time,
                data.status || BOOKING_STATUS.PENDING, data.price, data.notes || null
            ]
        );
        return result.insertId;
    },

    async findByUser(userId: number, limit = 20, offset = 0, statusList?: string[]): Promise<{ bookings: any[]; total: number }> {
        let where = 'WHERE b.user_id = ?';
        const values: any[] = [userId];

        if (statusList && statusList.length > 0) {
            where += ` AND b.status IN (${statusList.map(() => '?').join(',')})`;
            values.push(...statusList);
        }

        const [countRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) as total FROM bookings b ${where}`, values
        );
        const total = countRows[0].total;

        const query = `
      SELECT b.id, b.user_id, b.service_id,
             b.technician_id,
             b.address_id, b.scheduled_date, b.scheduled_time,
             ADDTIME(b.scheduled_time, SEC_TO_TIME(COALESCE(s.duration_minutes, 60) * 60)) AS time_slot_end,
             b.status, b.price, b.notes, b.assigned_at, b.completed_at, b.created_at, b.updated_at,
             s.name as service_name, s.image_url as service_image, s.category as service_category, s.duration_minutes,
             a.line1 as address_line1, a.city as address_city, a.state as address_state, a.postal_code as address_postal_code,
             t.full_name as technician_name,
             t.phone as technician_phone
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      LEFT JOIN addresses a ON b.address_id = a.id
      LEFT JOIN users t ON b.technician_id = t.id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const queryValues = [...values, limit, offset];
        const [rows] = await pool.query<RowDataPacket[]>(query, queryValues);
        return { bookings: rows as any[], total };
    },

    async findById(id: number): Promise<Booking | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT b.id, b.user_id, b.service_id,
                    b.technician_id,
                    b.address_id, b.scheduled_date, b.scheduled_time,
                    ADDTIME(b.scheduled_time, SEC_TO_TIME(COALESCE(s.duration_minutes, 60) * 60)) AS time_slot_end,
                    b.status, b.price, b.notes, b.assigned_at, b.completed_at, b.created_at, b.updated_at,
                    s.name as service_name, s.duration_minutes, s.image_url as service_image, s.category as service_category,
                    a.line1 as address_line1, a.city as address_city, a.state as address_state, a.postal_code as address_postal_code,
                    t.full_name as technician_name,
                    t.phone as technician_phone
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         LEFT JOIN addresses a ON b.address_id = a.id
         LEFT JOIN users t ON b.technician_id = t.id
         WHERE b.id = ?`,
            [id]
        );
        return (rows[0] as Booking) || null;
    },

    async updateStatus(id: number, status: string): Promise<void> {
        await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
    }
};
