import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { successResponse, errorResponse } from '../utils/response';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getKycList(
    profileTable: string,
    docTable: string,
    docForeignKey: string,
    statusFilter?: string
) {
    const whereClause = statusFilter ? `WHERE p.verification_status = ?` : '';
    const params: any[] = statusFilter ? [statusFilter] : [];

    const [users] = await pool.query<RowDataPacket[]>(
        `SELECT u.id, u.full_name, u.email, u.phone, p.verification_status
         FROM users u
         JOIN ${profileTable} p ON p.user_id = u.id
         ${whereClause}
         ORDER BY u.id DESC`,
        params
    );

    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);
    const [docs] = await pool.query<RowDataPacket[]>(
        `SELECT ${docForeignKey} as profile_user_id, doc_type, file_url, status
         FROM ${docTable}
         WHERE ${docForeignKey} IN (?)
         ORDER BY id ASC`,
        [userIds]
    );

    const docsMap = new Map<number, any[]>();
    for (const doc of docs) {
        const uid = Number(doc.profile_user_id);
        if (!docsMap.has(uid)) docsMap.set(uid, []);
        docsMap.get(uid)!.push({
            docType: doc.doc_type,
            fileUrl: doc.file_url,
            status: doc.status,
        });
    }

    return users.map((u) => ({
        userId: u.id,
        fullName: u.full_name,
        email: u.email,
        phone: u.phone,
        verificationStatus: u.verification_status,
        documents: docsMap.get(u.id) || [],
    }));
}

// ─── Agent KYC ──────────────────────────────────────────────────────────────

export const listAgentKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status = req.query.status as string | undefined;
        const result = await getKycList('agent_profiles', 'agent_kyc_documents', 'agent_id', status);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const approveAgentKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const agentId = Number(req.params.agentId);
        const { review_notes } = req.body;

        await pool.query(
            `UPDATE agent_profiles SET verification_status = 'approved' WHERE user_id = ?`,
            [agentId]
        );
        await pool.query(
            `UPDATE agent_kyc_documents
             SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
             ${review_notes ? ', review_notes = ?' : ''}
             WHERE agent_id = ?`,
            review_notes ? [adminId, review_notes, agentId] : [adminId, agentId]
        );

        return successResponse(res, null, 'Agent KYC approved');
    } catch (error) {
        next(error);
    }
};

export const rejectAgentKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const agentId = Number(req.params.agentId);
        const { review_notes } = req.body;

        if (!review_notes || String(review_notes).trim() === '') {
            return errorResponse(res, 'review_notes is required when rejecting', 400);
        }

        await pool.query(
            `UPDATE agent_profiles SET verification_status = 'rejected' WHERE user_id = ?`,
            [agentId]
        );
        await pool.query(
            `UPDATE agent_kyc_documents
             SET status = 'rejected', review_notes = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE agent_id = ?`,
            [review_notes, adminId, agentId]
        );

        return successResponse(res, null, 'Agent KYC rejected');
    } catch (error) {
        next(error);
    }
};

// ─── Dealer KYC ─────────────────────────────────────────────────────────────

export const listDealerKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status = req.query.status as string | undefined;
        const result = await getKycList('dealer_profiles', 'dealer_kyc_documents', 'dealer_id', status);
        return successResponse(res, result);
    } catch (error) {
        next(error);
    }
};

export const approveDealerKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const dealerId = Number(req.params.dealerId);
        const { review_notes } = req.body;

        await pool.query(
            `UPDATE dealer_profiles SET verification_status = 'approved' WHERE user_id = ?`,
            [dealerId]
        );
        await pool.query(
            `UPDATE dealer_kyc_documents
             SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
             ${review_notes ? ', review_notes = ?' : ''}
             WHERE dealer_id = ?`,
            review_notes ? [adminId, review_notes, dealerId] : [adminId, dealerId]
        );

        return successResponse(res, null, 'Dealer KYC approved');
    } catch (error) {
        next(error);
    }
};

export const rejectDealerKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const dealerId = Number(req.params.dealerId);
        const { review_notes } = req.body;

        if (!review_notes || String(review_notes).trim() === '') {
            return errorResponse(res, 'review_notes is required when rejecting', 400);
        }

        await pool.query(
            `UPDATE dealer_profiles SET verification_status = 'rejected' WHERE user_id = ?`,
            [dealerId]
        );
        await pool.query(
            `UPDATE dealer_kyc_documents
             SET status = 'rejected', review_notes = ?, reviewed_by = ?, reviewed_at = NOW()
             WHERE dealer_id = ?`,
            [review_notes, adminId, dealerId]
        );

        return successResponse(res, null, 'Dealer KYC rejected');
    } catch (error) {
        next(error);
    }
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const role = req.query.role as string | undefined;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;

        const whereClause = role ? 'WHERE role = ?' : '';
        const params: any[] = role ? [role] : [];

        const [countRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) as total FROM users ${whereClause}`,
            params
        );
        const total = Number(countRows[0].total);

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, full_name, email, phone, role, is_active, created_at
             FROM users
             ${whereClause}
             ORDER BY id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return successResponse(res, {
            users: rows,
            pagination: {
                page,
                limit,
                totalItems: total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
};
