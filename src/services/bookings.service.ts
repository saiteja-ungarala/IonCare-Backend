import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { BookingModel } from '../models/booking.model';
import { BookingUpdateModel } from '../models/booking-update.model';
import { ServiceModel } from '../models/service.model';
import { AddressModel } from '../models/address.model';
import { UserModel } from '../models/user.model';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';
import { BOOKING_STATUS } from '../config/constants';

// Map status query param to actual DB status values
const STATUS_MAP: Record<string, string[]> = {
    active: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.IN_PROGRESS],
    completed: [BOOKING_STATUS.COMPLETED],
    cancelled: [BOOKING_STATUS.CANCELLED],
};

export const BookingService = {
    async getBookings(userId: number, query: any) {
        const page = parseInt(query.page as string) || 1;
        const limit = parseInt(query.pageSize as string) || 20;
        const offset = (page - 1) * limit;

        // Resolve status filter
        const statusParam = (query.status as string || '').toLowerCase();
        const statusList = STATUS_MAP[statusParam] || undefined;

        const { bookings, total } = await BookingModel.findByUser(userId, limit, offset, statusList);

        return {
            data: bookings,
            pagination: {
                page,
                pageSize: limit,
                totalItems: total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },

    async createBooking(userId: number, data: any) {
        const service = await ServiceModel.findById(data.service_id);
        if (!service) throw { type: 'AppError', message: 'Service not found', statusCode: 404 };

        if (data.address_id) {
            const address = await AddressModel.findById(data.address_id);
            if (!address || address.user_id !== userId) throw { type: 'AppError', message: 'Invalid address', statusCode: 400 };
        }

        // Transactional booking create — checks First Service Free benefit
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        let bookingId = 0;
        try {
            const [benefits] = await conn.execute<RowDataPacket[]>(
                `SELECT * FROM user_benefits
                 WHERE user_id = ? AND benefit_code = 'FIRST_SERVICE_FREE' AND status = 'unused'
                 FOR UPDATE`,
                [userId]
            );
            const hasFree = benefits.length > 0;
            const finalPrice = hasFree ? 0 : service.base_price;

            const [result] = await conn.execute<ResultSetHeader>(
                `INSERT INTO bookings (user_id, service_id, address_id, scheduled_date, scheduled_time, status, price, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, data.service_id, data.address_id || null,
                    data.scheduled_date, data.scheduled_time,
                    BOOKING_STATUS.PENDING, finalPrice, data.notes || null,
                ]
            );
            bookingId = result.insertId;

            if (hasFree) {
                await conn.execute(
                    `UPDATE user_benefits SET status = 'used', used_at = NOW(), used_booking_id = ?
                     WHERE id = ?`,
                    [bookingId, benefits[0].id]
                );
            }

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        const booking = await BookingModel.findById(bookingId);

        // Fire-and-forget: send booking confirmation email + push
        UserModel.findById(userId).then((user) => {
            if (user?.email && booking) {
                const address = [
                    (booking as any).address_line1,
                    (booking as any).address_city,
                ].filter(Boolean).join(', ') || 'Address on file';
                EmailService.sendBookingConfirmation(user.email, {
                    bookingId,
                    serviceName: service.name,
                    scheduledDate: `${data.scheduled_date} ${data.scheduled_time}`,
                    address,
                });
            }
            NotificationService.sendToUser(userId, 'Booking Confirmed', 'Finding your technician...', { type: 'booking_created', bookingId });
        }).catch((err) => console.error('[BookingService] notification error:', err));

        return booking;
    },

    async getBookingUpdates(userId: number, bookingId: number) {
        const booking = await BookingModel.findById(bookingId);
        if (!booking) {
            throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
        }

        if (Number(booking.user_id) !== userId && Number(booking.agent_id) !== userId) {
            throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
        }

        return BookingUpdateModel.findByBookingId(bookingId);
    },

    async cancelBooking(userId: number, bookingId: number) {
        const booking = await BookingModel.findById(bookingId);
        if (!booking) throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
        if (booking.user_id !== userId) throw { type: 'AppError', message: 'Unauthorized', statusCode: 403 };
        if (booking.status !== 'pending' && booking.status !== 'confirmed') {
            throw { type: 'AppError', message: 'Cannot cancel booking in current status', statusCode: 400 };
        }

        await BookingModel.updateStatus(bookingId, 'cancelled');
    }
};
