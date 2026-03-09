import { z } from 'zod';

export const PushTokenSchema = z.object({
    body: z.object({
        token: z.string().min(1, 'token is required'),
        platform: z.enum(['ios', 'android', 'web']),
    }),
});

export const AddressSchema = z.object({
    body: z.object({
        label: z.string().optional(),
        line1: z.string().min(1, 'Address line 1 is required'),
        line2: z.string().optional(),
        city: z.string().min(1, 'City is required'),
        state: z.string().min(1, 'State is required'),
        postal_code: z.string().min(1, 'Postal code is required'),
        country: z.string().default('India'),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        is_default: z.boolean().default(false),
    }),
});

export const UpdateAddressSchema = z.object({
    body: z.object({
        label: z.string().optional(),
        line1: z.string().min(1, 'Address line 1 is required').optional(),
        line2: z.string().optional(),
        city: z.string().min(1, 'City is required').optional(),
        state: z.string().min(1, 'State is required').optional(),
        postal_code: z.string().min(1, 'Postal code is required').optional(),
        country: z.string().min(1, 'Country is required').optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        is_default: z.boolean().optional(),
    }).strict().refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field is required to update address',
    }),
});
