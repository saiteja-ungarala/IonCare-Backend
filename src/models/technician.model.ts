import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { BOOKING_STATUS } from '../config/constants';
import crypto from 'crypto';
import { TECHNICIAN_ROLE } from '../utils/technician-domain';

export interface TechnicianProfileRow extends RowDataPacket {
    user_id: number;
    verification_status: string;
    is_online: number;
    service_radius_km: number;
    base_lat: number | null;
    base_lng: number | null;
    last_online_at: Date | null;
    full_name: string;
    phone: string | null;
}

export interface KycDocumentInput {
    doc_type: string;
    file_url: string;
}

export const TechnicianModel = {
    async ensureProfile(userId: number): Promise<void> {
        await pool.query(
            `INSERT INTO technician_profiles (user_id, verification_status, is_online, service_radius_km)
             VALUES (?, 'unverified', 0, 10)
             ON DUPLICATE KEY UPDATE user_id = user_id`,
            [userId]
        );
    },

    async getProfile(userId: number): Promise<TechnicianProfileRow | null> {
        const [rows] = await pool.query<TechnicianProfileRow[]>(
            `SELECT tp.*, u.full_name, u.phone
             FROM technician_profiles tp
             JOIN users u ON u.id = tp.user_id
             WHERE tp.user_id = ?`,
            [userId]
        );
        return rows[0] || null;
    },

    async getReferralCode(userId: number): Promise<string | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT referral_code
             FROM users
             WHERE id = ? AND role = ?`,
            [userId, TECHNICIAN_ROLE]
        );

        const referralCode = rows[0]?.referral_code;
        return typeof referralCode === 'string' && referralCode.length > 0 ? referralCode : null;
    },

    async ensureReferralCode(userId: number): Promise<string> {
        const existingCode = await this.getReferralCode(userId);
        if (existingCode) {
            return existingCode;
        }

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
            const candidate = `AG${userId}${randomPart}`;

            try {
                const [result] = await pool.query<ResultSetHeader>(
                    `UPDATE users
                     SET referral_code = ?
                     WHERE id = ?
                       AND role = ?
                       AND (referral_code IS NULL OR referral_code = '')`,
                    [candidate, userId, TECHNICIAN_ROLE]
                );

                if (result.affectedRows > 0) {
                    return candidate;
                }

                const concurrentCode = await this.getReferralCode(userId);
                if (concurrentCode) {
                    return concurrentCode;
                }
            } catch (error: any) {
                if (error?.code !== 'ER_DUP_ENTRY') {
                    throw error;
                }
            }
        }

        throw {
            type: 'AppError',
            message: 'Unable to generate referral code at this time',
            statusCode: 500,
        };
    },

    async getLatestKyc(userId: number): Promise<RowDataPacket | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, doc_type, file_url, status, review_notes, reviewed_by, reviewed_at, created_at
             FROM technician_kyc_documents
             WHERE technician_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    },

    async getKycCounts(userId: number): Promise<Record<string, number>> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT status, COUNT(*) as total
             FROM technician_kyc_documents
             WHERE technician_id = ?
             GROUP BY status`,
            [userId]
        );

        const counts: Record<string, number> = { total: 0 };
        for (const row of rows) {
            counts[row.status] = Number(row.total);
            counts.total += Number(row.total);
        }
        return counts;
    },

    async insertKycDocuments(userId: number, documents: KycDocumentInput[]): Promise<void> {
        if (documents.length === 0) return;

        const values = documents.map((doc) => [userId, doc.doc_type, doc.file_url, 'pending']);
        await pool.query(
            `INSERT INTO technician_kyc_documents (technician_id, doc_type, file_url, status) VALUES ?`,
            [values]
        );
    },

    async hasActiveJob(technicianId: number): Promise<boolean> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS cnt
             FROM bookings
             WHERE technician_id = ? AND status IN ('assigned', 'in_progress')`,
            [technicianId]
        );
        return Number(rows[0].cnt) > 0;
    },

    async getJobUpdates(bookingId: number, technicianId: number): Promise<RowDataPacket[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, update_type, note, media_url, created_at
             FROM booking_updates
             WHERE booking_id = ? AND technician_id = ?
             ORDER BY created_at ASC, id ASC`,
            [bookingId, technicianId]
        );
        return rows;
    },

    async setVerificationStatus(userId: number, status: string): Promise<void> {
        await pool.query(
            `UPDATE technician_profiles SET verification_status = ? WHERE user_id = ?`,
            [status, userId]
        );
    },

    async setOnline(userId: number, isOnline: boolean): Promise<void> {
        await pool.query(
            `UPDATE technician_profiles
             SET is_online = ?, last_online_at = NOW()
             WHERE user_id = ?`,
            [isOnline ? 1 : 0, userId]
        );
    },

    async getAvailableJobsWithinRadius(params: {
        technicianId: number;
        baseLat: number;
        baseLng: number;
        radiusKm: number;
    }): Promise<RowDataPacket[]> {
        const { technicianId, baseLat, baseLng, radiusKm } = params;
        const distanceExpr = `
            (6371 * ACOS(
                COS(RADIANS(?)) * COS(RADIANS(a.latitude)) *
                COS(RADIANS(a.longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(a.latitude))
            ))
        `;

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT
                b.id,
                b.user_id,
                b.service_id,
                b.address_id,
                b.scheduled_date,
                b.scheduled_time,
                b.time_slot_end,
                b.status,
                b.price,
                b.notes,
                b.created_at,
                s.name AS service_name,
                s.image_url AS service_image,
                s.category AS service_category,
                s.duration_minutes,
                a.line1 AS address_line1,
                a.line2 AS address_line2,
                a.city AS address_city,
                a.state AS address_state,
                a.postal_code AS address_postal_code,
                a.latitude AS address_latitude,
                a.longitude AS address_longitude,
                u.full_name AS customer_name,
                u.phone AS customer_phone,
                ROUND(${distanceExpr}, 2) AS distance_km
             FROM bookings b
             JOIN services s ON s.id = b.service_id
             LEFT JOIN addresses a ON a.id = b.address_id
             JOIN users u ON u.id = b.user_id
             LEFT JOIN booking_offers bo_rejected
                ON bo_rejected.booking_id = b.id
               AND bo_rejected.technician_id = ?
               AND bo_rejected.status = 'rejected'
             WHERE b.technician_id IS NULL
               AND b.status = ?
               AND bo_rejected.id IS NULL
               AND a.latitude IS NOT NULL
               AND a.longitude IS NOT NULL
             HAVING distance_km <= ?
             ORDER BY b.created_at ASC`,
            [
                baseLat,
                baseLng,
                baseLat,
                technicianId,
                BOOKING_STATUS.CONFIRMED,
                radiusKm,
            ]
        );

        return rows;
    },

    async getAvailableJobsWithoutDistance(technicianId: number): Promise<RowDataPacket[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT
                b.id,
                b.user_id,
                b.service_id,
                b.address_id,
                b.scheduled_date,
                b.scheduled_time,
                b.time_slot_end,
                b.status,
                b.price,
                b.notes,
                b.created_at,
                s.name AS service_name,
                s.image_url AS service_image,
                s.category AS service_category,
                s.duration_minutes,
                a.line1 AS address_line1,
                a.line2 AS address_line2,
                a.city AS address_city,
                a.state AS address_state,
                a.postal_code AS address_postal_code,
                a.latitude AS address_latitude,
                a.longitude AS address_longitude,
                u.full_name AS customer_name,
                u.phone AS customer_phone,
                NULL AS distance_km
             FROM bookings b
             JOIN services s ON s.id = b.service_id
             LEFT JOIN addresses a ON a.id = b.address_id
             JOIN users u ON u.id = b.user_id
             LEFT JOIN booking_offers bo_rejected
                ON bo_rejected.booking_id = b.id
               AND bo_rejected.technician_id = ?
               AND bo_rejected.status = 'rejected'
             WHERE b.technician_id IS NULL
               AND b.status = ?
               AND bo_rejected.id IS NULL
             ORDER BY b.created_at ASC`,
            [
                technicianId,
                BOOKING_STATUS.CONFIRMED,
            ]
        );

        return rows;
    },

    async getMyAssignedJobs(technicianId: number): Promise<RowDataPacket[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT
                b.id,
                b.user_id,
                b.service_id,
                b.address_id,
                b.scheduled_date,
                b.scheduled_time,
                b.time_slot_end,
                b.status,
                b.price,
                b.notes,
                b.created_at,
                s.name AS service_name,
                s.image_url AS service_image,
                s.category AS service_category,
                s.duration_minutes,
                a.line1 AS address_line1,
                a.line2 AS address_line2,
                a.city AS address_city,
                a.state AS address_state,
                a.postal_code AS address_postal_code,
                a.latitude AS address_latitude,
                a.longitude AS address_longitude,
                u.full_name AS customer_name,
                u.phone AS customer_phone,
                NULL AS distance_km
             FROM bookings b
             JOIN services s ON s.id = b.service_id
             LEFT JOIN addresses a ON a.id = b.address_id
             JOIN users u ON u.id = b.user_id
             WHERE b.technician_id = ?
               AND b.status IN (?, ?, ?)
             ORDER BY b.created_at DESC`,
            [
                technicianId,
                BOOKING_STATUS.ASSIGNED,
                BOOKING_STATUS.IN_PROGRESS,
                BOOKING_STATUS.COMPLETED,
            ]
        );

        return rows;
    },
};
