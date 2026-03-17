import { env } from '../config/env';

export const SmsService = {
    async sendOTP(phone: string, otp: string): Promise<void> {
        // DISABLED — Fast2SMS call commented out until API key is configured
        // const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        //     method: 'POST',
        //     headers: {
        //         'authorization': env.FAST2SMS_API_KEY,
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         variables_values: otp,
        //         route: 'otp',
        //         numbers: phone,
        //     }),
        // });
        //
        // if (!response.ok) {
        //     throw { type: 'AppError', message: 'Failed to send OTP. Please try again.', statusCode: 502 };
        // }
        console.warn(`[SmsService] Fast2SMS disabled — OTP for ${phone}: ${otp}`);
    },
};
