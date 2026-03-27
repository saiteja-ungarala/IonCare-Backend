import { z } from 'zod';

const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

export const CreateBookingSchema = z.object({
    body: z.object({
        service_id: z.number(),
        scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format YYYY-MM-DD'),
        scheduled_time: z.string().regex(TIME_REGEX, 'Invalid time format HH:MM or HH:MM:SS'),
        // Optional: if omitted the server computes it from scheduled_time + service duration
        time_slot_end: z.string().regex(TIME_REGEX, 'Invalid time format HH:MM or HH:MM:SS').optional(),
        address_id: z.number().optional(),
        notes: z.string().optional(),
    }),
});
