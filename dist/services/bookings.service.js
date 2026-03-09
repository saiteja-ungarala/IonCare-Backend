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
            if (data.address_id) {
                const address = yield address_model_1.AddressModel.findById(data.address_id);
                if (!address || address.user_id !== userId)
                    throw { type: 'AppError', message: 'Invalid address', statusCode: 400 };
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
                const [result] = yield conn.execute(`INSERT INTO bookings (user_id, service_id, address_id, scheduled_date, scheduled_time, status, price, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId, data.service_id, data.address_id || null,
                    data.scheduled_date, data.scheduled_time,
                    constants_1.BOOKING_STATUS.PENDING, finalPrice, data.notes || null,
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
                notification_service_1.NotificationService.sendToUser(userId, 'Booking Confirmed', 'Finding your technician...', { type: 'booking_created', bookingId });
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
            if (Number(booking.user_id) !== userId && Number(booking.agent_id) !== userId) {
                throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
            }
            return booking_update_model_1.BookingUpdateModel.findByBookingId(bookingId);
        });
    },
    cancelBooking(userId, bookingId) {
        return __awaiter(this, void 0, void 0, function* () {
            const booking = yield booking_model_1.BookingModel.findById(bookingId);
            if (!booking)
                throw { type: 'AppError', message: 'Booking not found', statusCode: 404 };
            if (booking.user_id !== userId)
                throw { type: 'AppError', message: 'Unauthorized', statusCode: 403 };
            if (booking.status !== 'pending' && booking.status !== 'confirmed') {
                throw { type: 'AppError', message: 'Cannot cancel booking in current status', statusCode: 400 };
            }
            yield booking_model_1.BookingModel.updateStatus(bookingId, 'cancelled');
        });
    }
};
