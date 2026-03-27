"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
const db_1 = __importDefault(require("../config/db"));
const booking_model_1 = require("../models/booking.model");
const booking_update_model_1 = require("../models/booking-update.model");
const service_model_1 = require("../models/service.model");
const address_model_1 = require("../models/address.model");
const user_model_1 = require("../models/user.model");
const wallet_model_1 = require("../models/wallet.model");
const email_service_1 = require("./email.service");
const notification_service_1 = require("./notification.service");
const constants_1 = require("../config/constants");
// Map status query param to actual DB status values
const STATUS_MAP = {
    active: [constants_1.BOOKING_STATUS.PENDING, constants_1.BOOKING_STATUS.CONFIRMED, constants_1.BOOKING_STATUS.ASSIGNED, constants_1.BOOKING_STATUS.IN_PROGRESS],
    completed: [constants_1.BOOKING_STATUS.COMPLETED],
    cancelled: [constants_1.BOOKING_STATUS.CANCELLED],
};
exports.BookingService = {
    getBookings(userId, query) {
        return __awaiter(this, void 0, void 0, function* () {
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.pageSize) || 20;
            const offset = (page - 1) * limit;
            // Resolve status filter
            const statusParam = (query.status || '').toLowerCase();
            const statusList = STATUS_MAP[statusParam] || undefined;
            const { bookings, total } = yield booking_model_1.BookingModel.findByUser(userId, limit, offset, statusList);
            return {
                data: bookings,
                pagination: {
                    page,
                    pageSize: limit,
                    totalItems: total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        });
    },
    createBooking(userId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const service = yield service_model_1.ServiceModel.findById(data.service_id);
            if (!service)
                throw { type: 'AppError', message: 'Service not found', statusCode: 404 };
            if (!data.address_id) {
                throw { type: 'AppError', message: 'A service address is required', statusCode: 400 };
            }
            const address = yield address_model_1.AddressModel.findById(data.address_id);
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
            const conn = yield db_1.default.getConnection();
            yield conn.beginTransaction();
            let bookingId = 0;
            try {
                const [benefits] = yield conn.execute(`SELECT * FROM user_benefits
                 WHERE user_id = ? AND benefit_code = 'FIRST_SERVICE_FREE' AND status = 'unused'
                 FOR UPDATE`, [userId]);
                const hasFree = benefits.length > 0;
                const finalPrice = hasFree ? 0 : service.base_price;
                const initialStatus = finalPrice === 0 ? constants_1.BOOKING_STATUS.CONFIRMED : constants_1.BOOKING_STATUS.PENDING;
                const [result] = yield conn.execute(`INSERT INTO bookings (user_id, service_id, address_id, scheduled_date, scheduled_time, status, price, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId, data.service_id, data.address_id || null,
                    data.scheduled_date, data.scheduled_time,
                    initialStatus, finalPrice, data.notes || null,
                ]);
                bookingId = result.insertId;
                if (hasFree) {
                    yield conn.execute(`UPDATE user_benefits SET status = 'used', used_at = NOW(), used_booking_id = ?
                     WHERE id = ?`, [bookingId, benefits[0].id]);
                }
                yield conn.commit();
            }
            catch (err) {
                yield conn.rollback();
                throw err;
            }
            finally {
                conn.release();
            }
            const booking = yield booking_model_1.BookingModel.findById(bookingId);
            const shouldDispatchImmediately = (booking === null || booking === void 0 ? void 0 : booking.status) === constants_1.BOOKING_STATUS.CONFIRMED;
            if (shouldDispatchImmediately) {
                // Fire-and-forget: fan-out new job notification to nearby approved technicians
                exports.BookingService.fanOutToNearbyTechnicians(bookingId).catch((err) => console.error('[BookingService] fanOut error:', err));
            }
            // Fire-and-forget: send booking confirmation email + push
            user_model_1.UserModel.findById(userId).then((user) => {
                if ((user === null || user === void 0 ? void 0 : user.email) && booking) {
                    const address = [
                        booking.address_line1,
                        booking.address_city,
                    ].filter(Boolean).join(', ') || 'Address on file';
                    email_service_1.EmailService.sendBookingConfirmation(user.email, {
                        bookingId,
                        serviceName: service.name,
                        scheduledDate: `${data.scheduled_date} ${data.scheduled_time}`,
                        address,
                    });
                }
                notification_service_1.NotificationService.sendToUser(userId, shouldDispatchImmediately ? 'Booking Confirmed' : 'Booking Created', shouldDispatchImmediately
                    ? 'Finding your technician...'
                    : 'Complete payment to confirm and dispatch your technician.', { type: 'booking_created', bookingId });
            }).catch((err) => console.error('[BookingService] notification error:', err));
            return booking;
        });
    },
    getBookingUpdates(userId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            const booking = yield booking_model_1.BookingModel.findById(bookingId);
            if (!booking) {
                throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
            }
            const assignedTechnicianId = Number(booking.technician_id);
            if (Number(booking.user_id) !== userId && assignedTechnicianId !== userId) {
                throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
            }
            return booking_update_model_1.BookingUpdateModel.findByBookingId(bookingId);
        });
    },
    getBookingDetail(userId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const booking = yield booking_model_1.BookingModel.findById(bookingId);
            if (!booking) {
                throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
            }
            if (Number(booking.user_id) !== userId) {
                throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
            }
            const [[paymentRows], [updateRows]] = yield Promise.all([
                db_1.default.query(`SELECT razorpay_order_id, razorpay_payment_id, status, amount, created_at
                 FROM payments
                 WHERE entity_type = 'booking' AND entity_id = ?
                 ORDER BY created_at DESC LIMIT 1`, [bookingId]),
                db_1.default.query(`SELECT bu.id, bu.update_type, bu.note, bu.media_url, bu.created_at,
                        u.full_name AS technician_name
                 FROM booking_updates bu
                 LEFT JOIN users u ON u.id = bu.technician_id
                 WHERE bu.booking_id = ?
                 ORDER BY bu.created_at ASC, bu.id ASC`, [bookingId]),
            ]);
            return Object.assign(Object.assign({}, booking), { payment: (_a = paymentRows[0]) !== null && _a !== void 0 ? _a : null, updates: updateRows });
        });
    },
    cancelBooking(userId, bookingId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(reason === null || reason === void 0 ? void 0 : reason.trim())) {
                throw { type: 'AppError', message: 'Cancellation reason is required', statusCode: 400 };
            }
            const booking = yield booking_model_1.BookingModel.findById(bookingId);
            if (!booking)
                throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
            if (Number(booking.user_id) !== userId)
                throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
            if (booking.status !== 'pending' && booking.status !== 'confirmed') {
                throw { type: 'AppError', message: 'Cannot cancel a booking that is already assigned/in_progress/completed/cancelled', statusCode: 400 };
            }
            // Cancel the booking and record the reason
            yield db_1.default.query(`UPDATE bookings
             SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW()
             WHERE id = ?`, [reason.trim(), userId, bookingId]);
            // Refund if a paid Razorpay payment exists for this booking
            let refunded = false;
            let refundAmount = 0;
            const [payRows] = yield db_1.default.query(`SELECT id, amount FROM payments
             WHERE entity_type = 'booking' AND entity_id = ? AND status = 'paid'
             LIMIT 1`, [bookingId]);
            if (payRows.length > 0) {
                refundAmount = Number(payRows[0].amount);
                yield db_1.default.query(`UPDATE payments SET status = 'refunded' WHERE id = ?`, [payRows[0].id]);
                yield wallet_model_1.WalletModel.creditWithIdempotency(userId, {
                    amount: refundAmount,
                    txn_type: 'credit',
                    source: 'refund',
                    idempotency_key: `booking_cancel:${bookingId}`,
                });
                refunded = true;
            }
            return { success: true, refunded, refund_amount: refundAmount };
        });
    },
    fanOutToNearbyTechnicians(bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [bookingRows] = yield db_1.default.query(`SELECT b.status, b.technician_id, a.latitude, a.longitude
             FROM bookings b
             LEFT JOIN addresses a ON a.id = b.address_id
             WHERE b.id = ?`, [bookingId]);
            if (!bookingRows.length)
                return;
            const booking = bookingRows[0];
            if (booking.status !== constants_1.BOOKING_STATUS.CONFIRMED || booking.technician_id !== null)
                return;
            const { latitude: bookingLat, longitude: bookingLng } = booking;
            if (bookingLat === null || bookingLng === null)
                return;
            const [techRows] = yield db_1.default.query(`SELECT tp.user_id
             FROM technician_profiles tp
             WHERE tp.verification_status = 'approved'
               AND tp.is_online = 1
               AND tp.base_lat IS NOT NULL
               AND tp.base_lng IS NOT NULL
               AND (6371 * ACOS(
                   COS(RADIANS(tp.base_lat)) * COS(RADIANS(?)) *
                   COS(RADIANS(?) - RADIANS(tp.base_lng)) +
                   SIN(RADIANS(tp.base_lat)) * SIN(RADIANS(?))
               )) <= tp.service_radius_km`, [bookingLat, bookingLng, bookingLat]);
            for (const tech of techRows) {
                notification_service_1.NotificationService.sendToUser(Number(tech.user_id), 'New Job Available', 'A service request is available in your area', { type: 'new_job_available', bookingId });
            }
        });
    },
};
