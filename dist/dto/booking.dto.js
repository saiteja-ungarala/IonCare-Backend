"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBookingSchema = void 0;
const zod_1 = require("zod");
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
exports.CreateBookingSchema = zod_1.z.object({
    body: zod_1.z.object({
        service_id: zod_1.z.number(),
        scheduled_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format YYYY-MM-DD'),
        scheduled_time: zod_1.z.string().regex(TIME_REGEX, 'Invalid time format HH:MM or HH:MM:SS'),
        // Optional forward-compat field; read responses derive it from scheduled_time + service duration
        time_slot_end: zod_1.z.string().regex(TIME_REGEX, 'Invalid time format HH:MM or HH:MM:SS').optional(),
        address_id: zod_1.z.number().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
