import sgMail from '@sendgrid/mail';
import { env } from '../config/env';

sgMail.setApiKey(env.SENDGRID_API_KEY);

export const EmailService = {
    sendPasswordReset(to: string, resetLink: string): void {
        sgMail
            .send({
                to,
                from: env.FROM_EMAIL,
                subject: 'Reset your AquaCare password',
                text: `Click the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}\n\nIf you did not request a password reset, please ignore this email.`,
                html: `<p>Click the link below to reset your password. This link expires in <strong>1 hour</strong>.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request a password reset, please ignore this email.</p>`,
            })
            .catch((err) => console.error('[Email] sendPasswordReset error:', err?.response?.body ?? err));
    },

    sendBookingConfirmation(to: string, data: { bookingId: number; serviceName: string; scheduledDate: string; address: string }): void {
        sgMail
            .send({
                to,
                from: env.FROM_EMAIL,
                subject: `Booking Confirmed — #${data.bookingId}`,
                text: `Your booking has been confirmed!\n\nService: ${data.serviceName}\nDate: ${data.scheduledDate}\nAddress: ${data.address}\nBooking ID: #${data.bookingId}`,
                html: `<p>Your booking has been confirmed!</p><ul><li><strong>Service:</strong> ${data.serviceName}</li><li><strong>Date:</strong> ${data.scheduledDate}</li><li><strong>Address:</strong> ${data.address}</li><li><strong>Booking ID:</strong> #${data.bookingId}</li></ul>`,
            })
            .catch((err) => console.error('[Email] sendBookingConfirmation error:', err?.response?.body ?? err));
    },

    sendBookingAssigned(to: string, data: { bookingId: number; agentName: string }): void {
        sgMail
            .send({
                to,
                from: env.FROM_EMAIL,
                subject: `Technician Assigned — Booking #${data.bookingId}`,
                text: `Good news! A technician has been assigned to your booking #${data.bookingId}.\n\nTechnician: ${data.agentName}\n\nThey will contact you shortly.`,
                html: `<p>Good news! A technician has been assigned to your booking <strong>#${data.bookingId}</strong>.</p><p><strong>Technician:</strong> ${data.agentName}</p><p>They will contact you shortly.</p>`,
            })
            .catch((err) => console.error('[Email] sendBookingAssigned error:', err?.response?.body ?? err));
    },

    sendBookingCompleted(to: string, data: { bookingId: number; amount: number }): void {
        sgMail
            .send({
                to,
                from: env.FROM_EMAIL,
                subject: `Service Completed — Booking #${data.bookingId}`,
                text: `Your service for booking #${data.bookingId} has been completed.\n\nAmount: Rs.${data.amount}\n\nThank you for choosing AquaCare!`,
                html: `<p>Your service for booking <strong>#${data.bookingId}</strong> has been completed.</p><p><strong>Amount:</strong> Rs.${data.amount}</p><p>Thank you for choosing AquaCare!</p>`,
            })
            .catch((err) => console.error('[Email] sendBookingCompleted error:', err?.response?.body ?? err));
    },
};
