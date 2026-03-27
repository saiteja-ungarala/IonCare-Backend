import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { BookingModel } from '../models/booking.model';
import { BookingUpdateModel } from '../models/booking-update.model';
import { ServiceModel } from '../models/service.model';
import { AddressModel } from '../models/address.model';
import { UserModel } from '../models/user.model';
import { WalletModel } from '../models/wallet.model';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';
import { BOOKING_STATUS } from '../config/constants';

// Compute the end of a time slot given a HH:MM or HH:MM:SS start and a duration in minutes.
// Used when the caller does not supply an explicit time_slot_end.
function computeTimeSlotEnd(startTime: string, durationMinutes: number): string {
    const parts = startTime.split(':').map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    const totalMins = h * 60 + m + (durationMinutes > 0 ? durationMinutes : 60);
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
}

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

        if (!data.address_id) {
            throw { type: 'AppError', message: 'A service address is required', statusCode: 400 };
        }

        const address = await AddressModel.findById(data.address_id);
        if (!address || address.user_id !== userId) {
            throw { type: 'AppError', message: 'Invalid address', statusCode: 400 };
        }
        if (address.latitude === undefined || address.latitude === null || address.longitude === undefined || address.longitude === null) {
            throw {
                type: 'AppError',
                message: 'Selected address is missing location coordinates. Update the address using current location before booking.',
                statusCode: 400,
            };
        }

        // Transactional booking create — checks First Service Free benefit
        // Resolve the slot end: use the caller's value or compute from service duration
        const timeSlotEnd: string = data.time_slot_end
            ?? computeTimeSlotEnd(data.scheduled_time, service.duration_minutes ?? 0);

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
            const initialStatus = finalPrice === 0 ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;

            const [result] = await conn.execute<ResultSetHeader>(
                `INSERT INTO bookings (user_id, service_id, address_id, scheduled_date, scheduled_time, time_slot_end, status, price, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, data.service_id, data.address_id || null,
                    data.scheduled_date, data.scheduled_time, timeSlotEnd,
                    initialStatus, finalPrice, data.notes || null,
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
        const shouldDispatchImmediately = booking?.status === BOOKING_STATUS.CONFIRMED;

        if (shouldDispatchImmediately) {
            // Fire-and-forget: fan-out new job notification to nearby approved technicians
            BookingService.fanOutToNearbyTechnicians(bookingId).catch((err) =>
                console.error('[BookingService] fanOut error:', err)
            );
        }

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
            NotificationService.sendToUser(
                userId,
                shouldDispatchImmediately ? 'Booking Confirmed' : 'Booking Created',
                shouldDispatchImmediately
                    ? 'Finding your technician...'
                    : 'Complete payment to confirm and dispatch your technician.',
                { type: 'booking_created', bookingId }
            );
        }).catch((err) => console.error('[BookingService] notification error:', err));

        return booking;
    },

    async getBookingUpdates(userId: number, bookingId: number) {
        const booking = await BookingModel.findById(bookingId);
        if (!booking) {
            throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
        }

        const assignedTechnicianId = Number((booking as any).technician_id);
        if (Number(booking.user_id) !== userId && assignedTechnicianId !== userId) {
            throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
        }

        return BookingUpdateModel.findByBookingId(bookingId);
    },

    async getBookingDetail(userId: number, bookingId: number) {
        const booking = await BookingModel.findById(bookingId);
        if (!booking) {
            throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
        }
        if (Number(booking.user_id) !== userId) {
            throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
        }

        const [[paymentRows], [updateRows]] = await Promise.all([
            pool.query<RowDataPacket[]>(
                `SELECT razorpay_order_id, razorpay_payment_id, status, amount, created_at
                 FROM payments
                 WHERE entity_type = 'booking' AND entity_id = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [bookingId]
            ),
            pool.query<RowDataPacket[]>(
                `SELECT bu.id, bu.update_type, bu.note, bu.media_url, bu.created_at,
                        u.full_name AS technician_name
                 FROM booking_updates bu
                 LEFT JOIN users u ON u.id = bu.technician_id
                 WHERE bu.booking_id = ?
                 ORDER BY bu.created_at ASC, bu.id ASC`,
                [bookingId]
            ),
        ]);

        return {
            ...booking,
            payment: paymentRows[0] ?? null,
            updates: updateRows,
        };
    },

    async cancelBooking(userId: number, bookingId: number, reason: string) {
        if (!reason?.trim()) {
            throw { type: 'AppError', message: 'Cancellation reason is required', statusCode: 400 };
        }

        const booking = await BookingModel.findById(bookingId);
        if (!booking) throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
        if (Number(booking.user_id) !== userId) throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };

        // Atomic status-guarded cancel — prevents race where a technician accepts the job
        // between the status read above and the update below.
        const [cancelResult] = await pool.query<ResultSetHeader>(
            `UPDATE bookings
             SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW()
             WHERE id = ? AND status IN ('pending', 'confirmed')`,
            [reason.trim(), userId, bookingId]
        );
        if (cancelResult.affectedRows === 0) {
            throw { type: 'AppError', message: 'Cannot cancel a booking that is already assigned/in_progress/completed/cancelled', statusCode: 400 };
        }

        // Refund if a paid Razorpay payment exists for this booking
        let refunded = false;
        let refundAmount = 0;
        const [payRows] = await pool.query<RowDataPacket[]>(
            `SELECT id, amount FROM payments
             WHERE entity_type = 'booking' AND entity_id = ? AND status = 'paid'
             LIMIT 1`,
            [bookingId]
        );
        if (payRows.length > 0) {
            refundAmount = Number(payRows[0].amount);
            await pool.query(
                `UPDATE payments SET status = 'refunded' WHERE id = ?`,
                [payRows[0].id]
            );
            await WalletModel.creditWithIdempotency(userId, {
                amount: refundAmount,
                txn_type: 'credit',
                source: 'refund',
                idempotency_key: `booking_cancel:${bookingId}`,
            });
            refunded = true;
        }

        return { success: true, refunded, refund_amount: refundAmount };
    },

    async fanOutToNearbyTechnicians(bookingId: number): Promise<void> {
        const [bookingRows] = await pool.query<RowDataPacket[]>(
            `SELECT b.status, b.technician_id, a.latitude, a.longitude
             FROM bookings b
             LEFT JOIN addresses a ON a.id = b.address_id
             WHERE b.id = ?`,
            [bookingId]
        );
        if (!bookingRows.length) return;

        const booking = bookingRows[0];
        if (booking.status !== BOOKING_STATUS.CONFIRMED || booking.technician_id !== null) return;

        const { latitude: bookingLat, longitude: bookingLng } = booking;
        if (bookingLat === null || bookingLng === null) return;

        const [techRows] = await pool.query<RowDataPacket[]>(
            `SELECT tp.user_id
             FROM technician_profiles tp
             WHERE tp.verification_status = 'approved'
               AND tp.is_online = 1
               AND tp.base_lat IS NOT NULL
               AND tp.base_lng IS NOT NULL
               AND (6371 * ACOS(
                   COS(RADIANS(tp.base_lat)) * COS(RADIANS(?)) *
                   COS(RADIANS(?) - RADIANS(tp.base_lng)) +
                   SIN(RADIANS(tp.base_lat)) * SIN(RADIANS(?))
               )) <= tp.service_radius_km`,
            [bookingLat, bookingLng, bookingLat]
        );

        for (const tech of techRows) {
            NotificationService.sendToUser(
                Number(tech.user_id),
                'New Job Available',
                'A service request is available in your area',
                { type: 'new_job_available', bookingId }
            );
        }
    },
};
