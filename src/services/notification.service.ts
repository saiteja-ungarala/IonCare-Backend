import { PushTokenModel } from '../models/push-token.model';

interface PushMessage {
    to: string;
    title: string;
    body: string;
    data: Record<string, any>;
    sound: string;
    priority: string;
}

interface ExpoPushTicket {
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: { error?: string };
}

export const NotificationService = {
    async sendToUser(userId: number, title: string, body: string, data?: Record<string, any>): Promise<void> {
        try {
            const tokens = await PushTokenModel.findByUserId(userId);
            if (tokens.length === 0) return;

            const messages: PushMessage[] = tokens.map((t) => ({
                to: t.token,
                title,
                body,
                data: data || {},
                sound: 'default',
                priority: 'high',
            }));

            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messages),
            });

            if (!response.ok) return;

            const result = await response.json() as { data: ExpoPushTicket[] };
            const tickets: ExpoPushTicket[] = Array.isArray(result?.data) ? result.data : [];

            // Remove tokens that are no longer registered
            for (let i = 0; i < tickets.length; i++) {
                const ticket = tickets[i];
                if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
                    const token = tokens[i]?.token;
                    if (token) {
                        PushTokenModel.deleteByToken(token).catch((err) =>
                            console.error('[Notification] deleteByToken error:', err)
                        );
                    }
                }
            }
        } catch (err) {
            // Never throw — push failures must not affect any endpoint
            console.error('[Notification] sendToUser error:', err);
        }
    },
};
