"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateAddressSchema = exports.AddressSchema = exports.PushTokenSchema = void 0;
const zod_1 = require("zod");
exports.PushTokenSchema = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string().min(1, 'token is required'),
        platform: zod_1.z.enum(['ios', 'android', 'web']),
    }),
});
exports.AddressSchema = zod_1.z.object({
    body: zod_1.z.object({
        label: zod_1.z.string().optional(),
        line1: zod_1.z.string().min(1, 'Address line 1 is required'),
        line2: zod_1.z.string().optional(),
        city: zod_1.z.string().min(1, 'City is required'),
        state: zod_1.z.string().min(1, 'State is required'),
        postal_code: zod_1.z.string().min(1, 'Postal code is required'),
        country: zod_1.z.string().default('India'),
        latitude: zod_1.z.number().optional(),
        longitude: zod_1.z.number().optional(),
        is_default: zod_1.z.boolean().default(false),
    }),
});
exports.UpdateAddressSchema = zod_1.z.object({
    body: zod_1.z.object({
        label: zod_1.z.string().optional(),
        line1: zod_1.z.string().min(1, 'Address line 1 is required').optional(),
        line2: zod_1.z.string().optional(),
        city: zod_1.z.string().min(1, 'City is required').optional(),
        state: zod_1.z.string().min(1, 'State is required').optional(),
        postal_code: zod_1.z.string().min(1, 'Postal code is required').optional(),
        country: zod_1.z.string().min(1, 'Country is required').optional(),
        latitude: zod_1.z.number().optional(),
        longitude: zod_1.z.number().optional(),
        is_default: zod_1.z.boolean().optional(),
    }).strict().refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field is required to update address',
    }),
});
