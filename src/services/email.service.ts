import https from 'https';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { env } from '../config/env';

const EMAIL_PROVIDER_TIMEOUT_MS = 5000;
const isSendGridConfigured = Boolean(env.SENDGRID_API_KEY && env.FROM_EMAIL);
const isBrevoConfigured = Boolean(env.BREVO_API_KEY && (env.BREVO_FROM_EMAIL || env.FROM_EMAIL));
const isSmtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && (env.BREVO_FROM_EMAIL || env.FROM_EMAIL));

if (isSendGridConfigured) {
    sgMail.setApiKey(env.SENDGRID_API_KEY);
}

const smtpTransporter = isSmtpConfigured
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        connectionTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
        greetingTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
        socketTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
        dnsTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    })
    : null;

const createAppError = (message: string, statusCode: number, code: string) => ({
    type: 'AppError',
    message,
    statusCode,
    code,
});

const postJson = (url: string, body: string, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> =>
    new Promise((resolve, reject) => {
        const requestUrl = new URL(url);
        const request = https.request(
            {
                protocol: requestUrl.protocol,
                hostname: requestUrl.hostname,
                port: requestUrl.port || undefined,
                path: `${requestUrl.pathname}${requestUrl.search}`,
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Length': Buffer.byteLength(body).toString(),
                },
            },
            (response) => {
                let responseBody = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    responseBody += chunk;
                });
                response.on('end', () => {
                    resolve({
                        statusCode: response.statusCode || 500,
                        body: responseBody,
                    });
                });
            }
        );

        request.setTimeout(EMAIL_PROVIDER_TIMEOUT_MS, () => {
            request.destroy(new Error(`Brevo request timed out after ${EMAIL_PROVIDER_TIMEOUT_MS}ms`));
        });
        request.on('error', reject);
        request.write(body);
        request.end();
    });

const sendViaBrevo = async (message: Record<string, unknown>) => {
    const payload = {
        sender: {
            email: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
            name: env.BREVO_FROM_NAME || 'IONORA CARE',
        },
        to: [{ email: String(message.to || '') }],
        subject: String(message.subject || ''),
        textContent: String(message.text || ''),
        htmlContent: String(message.html || ''),
    };

    const response = await postJson('https://api.brevo.com/v3/smtp/email', JSON.stringify(payload), {
        'Content-Type': 'application/json',
        'api-key': env.BREVO_API_KEY,
        accept: 'application/json',
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`Brevo email failed with status ${response.statusCode}`);
    }
};

const sendViaSmtp = async (message: Record<string, unknown>) => {
    if (!smtpTransporter) {
        throw new Error('SMTP transporter is not configured');
    }

    await smtpTransporter.sendMail({
        from: {
            address: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
            name: env.BREVO_FROM_NAME || 'IONORA CARE',
        },
        to: String(message.to || ''),
        subject: String(message.subject || ''),
        text: String(message.text || ''),
        html: String(message.html || ''),
    });
};

const sendEmail = async (message: Record<string, unknown>, options?: { required?: boolean; logLabel?: string; userMessage?: string }) => {
    const deliveryProviders: Array<{ name: string; send: () => Promise<void> }> = [];

    if (isBrevoConfigured) {
        deliveryProviders.push({ name: 'Brevo API', send: () => sendViaBrevo(message) });
    }

    if (isSendGridConfigured) {
        deliveryProviders.push({ name: 'SendGrid', send: () => sgMail.send(message as any).then(() => undefined) });
    }

    if (isSmtpConfigured) {
        deliveryProviders.push({ name: 'SMTP', send: () => sendViaSmtp(message) });
    }

    if (deliveryProviders.length === 0) {
        if (options?.required) {
            throw createAppError(
                options.userMessage || 'Email service is temporarily unavailable.',
                503,
                'EMAIL_NOT_CONFIGURED'
            );
        }
        return;
    }

    let lastError: unknown = null;

    for (const provider of deliveryProviders) {
        try {
            await provider.send();
            return;
        } catch (error) {
            lastError = error;
            console.error(`[EmailService] ${options?.logLabel || 'send'} failed via ${provider.name}:`, error);
        }
    }

    if (lastError && options?.required) {
        throw createAppError(
            options.userMessage || 'Unable to send email right now. Please try again later.',
            502,
            'EMAIL_DELIVERY_FAILED'
        );
    }
};

export const EmailService = {
    async sendOtpVerification(to: string, otp: string, contextLabel: string): Promise<void> {
        await sendEmail(
            {
                to,
                from: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
                subject: `IONORA CARE ${contextLabel} OTP`,
                text: `Your IONORA CARE verification code is ${otp}. It will expire in 5 minutes.`,
                html: `<p>Your IONORA CARE verification code for <strong>${contextLabel}</strong> is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otp}</p><p>This code will expire in 5 minutes.</p>`,
            },
            {
                required: true,
                logLabel: 'otp verification',
                userMessage: 'Unable to send verification email right now. Please try again later.',
            }
        );
    },

    async sendPasswordReset(to: string, resetLink: string): Promise<void> {
        await sendEmail(
            {
                to,
                from: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
                subject: 'Reset your IonCare password',
                text: `Click the link below to reset your password. This link expires in 15 minutes.\n\n${resetLink}\n\nIf you did not request a password reset, please ignore this email.`,
                html: `<p>Click the link below to reset your password. This link expires in <strong>15 minutes</strong>.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request a password reset, please ignore this email.</p>`,
            },
            {
                required: true,
                logLabel: 'password reset',
                userMessage: 'Password reset is temporarily unavailable. Please contact support.',
            }
        );
    },

    sendBookingConfirmation(to: string, data: { bookingId: number; serviceName: string; scheduledDate: string; address: string }): void {
        void sendEmail(
            {
                to,
                from: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
                subject: `Booking Confirmed - #${data.bookingId}`,
                text: `Your booking has been confirmed.\n\nService: ${data.serviceName}\nDate: ${data.scheduledDate}\nAddress: ${data.address}\nBooking ID: #${data.bookingId}`,
                html: `<p>Your booking has been confirmed.</p><ul><li><strong>Service:</strong> ${data.serviceName}</li><li><strong>Date:</strong> ${data.scheduledDate}</li><li><strong>Address:</strong> ${data.address}</li><li><strong>Booking ID:</strong> #${data.bookingId}</li></ul>`,
            },
            { logLabel: 'booking confirmation' }
        );
    },

    sendBookingAssigned(to: string, data: { bookingId: number; agentName: string }): void {
        void sendEmail(
            {
                to,
                from: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
                subject: `Technician Assigned - Booking #${data.bookingId}`,
                text: `A technician has been assigned to your booking #${data.bookingId}.\n\nTechnician: ${data.agentName}\n\nThey will contact you shortly.`,
                html: `<p>A technician has been assigned to your booking <strong>#${data.bookingId}</strong>.</p><p><strong>Technician:</strong> ${data.agentName}</p><p>They will contact you shortly.</p>`,
            },
            { logLabel: 'booking assigned' }
        );
    },

    sendBookingCompleted(to: string, data: { bookingId: number; amount: number }): void {
        void sendEmail(
            {
                to,
                from: env.BREVO_FROM_EMAIL || env.FROM_EMAIL,
                subject: `Service Completed - Booking #${data.bookingId}`,
                text: `Your service for booking #${data.bookingId} has been completed.\n\nAmount: Rs.${data.amount}\n\nThank you for choosing IonCare.`,
                html: `<p>Your service for booking <strong>#${data.bookingId}</strong> has been completed.</p><p><strong>Amount:</strong> Rs.${data.amount}</p><p>Thank you for choosing IonCare.</p>`,
            },
            { logLabel: 'booking completed' }
        );
    },
};
