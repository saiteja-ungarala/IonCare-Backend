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
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBooking = exports.createBooking = exports.getBookings = void 0;
const bookings_service_1 = require("../services/bookings.service");
const response_1 = require("../utils/response");
const getBookings = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const result = yield bookings_service_1.BookingService.getBookings(userId, req.query);
        return (0, response_1.successResponse)(res, result.data);
    }
    catch (error) {
        next(error);
    }
});
exports.getBookings = getBookings;
const createBooking = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const result = yield bookings_service_1.BookingService.createBooking(userId, req.body);
        return (0, response_1.successResponse)(res, result, 'Booking confirmed', 201);
    }
    catch (error) {
        next(error);
    }
});
exports.createBooking = createBooking;
const cancelBooking = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const bookingId = Number(req.params.id);
        yield bookings_service_1.BookingService.cancelBooking(userId, bookingId);
        return (0, response_1.successResponse)(res, null, 'Booking cancelled');
    }
    catch (error) {
        next(error);
    }
});
exports.cancelBooking = cancelBooking;
