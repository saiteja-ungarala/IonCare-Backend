import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { RowDataPacket, OkPacket } from 'mysql2';
import { successResponse, errorResponse } from '../utils/response';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getKycListPaginated(
    profileTable: string,
    docTable: string,
    docForeignKey: string,
    statusFilter?: string,
    search?: string,
    page: number = 1,
    limit: number = 20
) {
    const conditions: string[] = [];
    const params: any[] = [];

    if (statusFilter) {
        conditions.push('p.verification_status = ?');
        params.push(statusFilter);
    }
    if (search) {
        conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM users u
         JOIN ${profileTable} p ON p.user_id = u.id
         ${where}`,
        params
    );
    const total = Number(countRows[0].total);

    const [users] = await pool.query<RowDataPacket[]>(
        `SELECT u.id, u.full_name, u.email, u.phone, u.created_at, p.verification_status
         FROM users u
         JOIN ${profileTable} p ON p.user_id = u.id
         ${where}
         ORDER BY u.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    if (users.length === 0) {
        return { items: [], pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) } };
    }

    const userIds = users.map((u) => u.id);
    const [docs] = await pool.query<RowDataPacket[]>(
        `SELECT ${docForeignKey} AS profile_user_id, doc_type, file_url, status
         FROM ${docTable}
         WHERE ${docForeignKey} IN (?)
         ORDER BY id ASC`,
        [userIds]
    );

    const docsMap = new Map<number, any[]>();
    for (const doc of docs) {
        const uid = Number(doc.profile_user_id);
        if (!docsMap.has(uid)) docsMap.set(uid, []);
        docsMap.get(uid)!.push({ docType: doc.doc_type, fileUrl: doc.file_url, status: doc.status });
    }

    const items = users.map((u) => ({
        userId: u.id,
        fullName: u.full_name,
        email: u.email,
        phone: u.phone,
        createdAt: u.created_at,
        verificationStatus: u.verification_status,
        documentCount: (docsMap.get(u.id) || []).length,
        documents: docsMap.get(u.id) || [],
    }));

    return {
        items,
        pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
    };
}

// ─── Agent KYC ──────────────────────────────────────────────────────────────

export const listAgentKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status  = req.query.status  as string | undefined;
        const search  = req.query.search  as string | undefined;
        const page    = Math.max(1, parseInt(req.query.page  as string) || 1);
        const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const result  = await getKycListPaginated(
            'agent_profiles', 'agent_kyc_documents', 'agent_id', status, search, page, limit
        );
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

        await logAdminAction(adminId, 'approved_agent_kyc', 'agent', agentId);
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

        await logAdminAction(adminId, 'rejected_agent_kyc', 'agent', agentId, { review_notes });
        return successResponse(res, null, 'Agent KYC rejected');
    } catch (error) {
        next(error);
    }
};

// ─── Dealer KYC ─────────────────────────────────────────────────────────────

export const listDealerKyc = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status  = req.query.status  as string | undefined;
        const search  = req.query.search  as string | undefined;
        const page    = Math.max(1, parseInt(req.query.page  as string) || 1);
        const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const result  = await getKycListPaginated(
            'dealer_profiles', 'dealer_kyc_documents', 'dealer_id', status, search, page, limit
        );
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

        await logAdminAction(adminId, 'approved_dealer_kyc', 'dealer', dealerId);
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

        await logAdminAction(adminId, 'rejected_dealer_kyc', 'dealer', dealerId, { review_notes });
        return successResponse(res, null, 'Dealer KYC rejected');
    } catch (error) {
        next(error);
    }
};

// ─── KYC Detail & Stats ──────────────────────────────────────────────────────

export const getAgentKycDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agentId = Number(req.params.agentId);

        const [userRows] = await pool.query<RowDataPacket[]>(
            `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at,
                    ap.verification_status, ap.created_at AS profile_created_at
             FROM users u
             JOIN agent_profiles ap ON ap.user_id = u.id
             WHERE u.id = ?`,
            [agentId]
        );
        if (userRows.length === 0) return errorResponse(res, 'Agent not found', 404);

        const [docRows] = await pool.query<RowDataPacket[]>(
            `SELECT d.id, d.doc_type, d.file_url, d.status,
                    d.reviewed_at, d.review_notes,
                    rev.full_name AS reviewed_by_name
             FROM agent_kyc_documents d
             LEFT JOIN users rev ON rev.id = d.reviewed_by
             WHERE d.agent_id = ?
             ORDER BY d.id ASC`,
            [agentId]
        );

        return successResponse(res, { ...userRows[0], documents: docRows });
    } catch (error) { next(error); }
};

export const getDealerKycDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dealerId = Number(req.params.dealerId);

        const [userRows] = await pool.query<RowDataPacket[]>(
            `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at,
                    dp.verification_status, dp.business_name, dp.gst_number,
                    dp.created_at AS profile_created_at
             FROM users u
             JOIN dealer_profiles dp ON dp.user_id = u.id
             WHERE u.id = ?`,
            [dealerId]
        );
        if (userRows.length === 0) return errorResponse(res, 'Dealer not found', 404);

        const [docRows] = await pool.query<RowDataPacket[]>(
            `SELECT d.id, d.doc_type, d.file_url, d.status,
                    d.reviewed_at, d.review_notes,
                    rev.full_name AS reviewed_by_name
             FROM dealer_kyc_documents d
             LEFT JOIN users rev ON rev.id = d.reviewed_by
             WHERE d.dealer_id = ?
             ORDER BY d.id ASC`,
            [dealerId]
        );

        return successResponse(res, { ...userRows[0], documents: docRows });
    } catch (error) { next(error); }
};

export const getKycStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [[agentRows], [dealerRows]] = await Promise.all([
            pool.query<RowDataPacket[]>(
                `SELECT COALESCE(verification_status, 'unverified') AS status, COUNT(*) AS cnt
                 FROM agent_profiles GROUP BY COALESCE(verification_status, 'unverified')`
            ),
            pool.query<RowDataPacket[]>(
                `SELECT COALESCE(verification_status, 'unverified') AS status, COUNT(*) AS cnt
                 FROM dealer_profiles GROUP BY COALESCE(verification_status, 'unverified')`
            ),
        ]);

        const toCounts = (rows: RowDataPacket[]) => {
            const map: Record<string, number> = { pending: 0, approved: 0, rejected: 0, unverified: 0 };
            for (const row of rows) map[row.status] = Number(row.cnt);
            return map;
        };

        return successResponse(res, {
            agents:  toCounts(agentRows),
            dealers: toCounts(dealerRows),
        });
    } catch (error) { next(error); }
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

// ─── Admin Activity Log ───────────────────────────────────────────────────────

export async function logAdminAction(
    adminId: number,
    action: string,
    entityType: string,
    entityId?: number,
    details?: Record<string, any>
): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO admin_activity_log (admin_id, action, entity_type, entity_id, details)
             VALUES (?, ?, ?, ?, ?)`,
            [adminId, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null]
        );
    } catch {
        // Non-fatal: log to stderr but never crash the caller
        console.error('[logAdminAction] Failed to write activity log', { action, entityType, entityId });
    }
}

// ─── Slug helper ─────────────────────────────────────────────────────────────

function toSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const results = await Promise.all([
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'customer'`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'agent'`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'dealer'`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM agent_profiles WHERE verification_status = 'pending'`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM dealer_profiles WHERE verification_status = 'pending'`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM bookings`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM bookings WHERE DATE(created_at) = CURDATE()`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM orders`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM orders WHERE DATE(created_at) = CURDATE()`),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid'`),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid' AND DATE(created_at) = CURDATE()`),
            pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid' AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM products WHERE is_active = 1`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM services WHERE is_active = 1`),
            pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM banners WHERE is_active = 1`),
            pool.query<RowDataPacket[]>(
                `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                        u.full_name AS admin_name
                 FROM admin_activity_log al
                 LEFT JOIN users u ON u.id = al.admin_id
                 ORDER BY al.created_at DESC
                 LIMIT 20`
            ),
        ]);

        const cnt = (idx: number): number => Number(results[idx][0][0]?.cnt ?? 0);
        const total = (idx: number): number => Number(results[idx][0][0]?.total ?? 0);

        return successResponse(res, {
            totalCustomers:   cnt(0),
            totalAgents:      cnt(1),
            totalDealers:     cnt(2),
            pendingAgentKyc:  cnt(3),
            pendingDealerKyc: cnt(4),
            totalBookings:    cnt(5),
            todayBookings:    cnt(6),
            totalOrders:      cnt(7),
            todayOrders:      cnt(8),
            totalRevenue:     total(9),
            todayRevenue:     total(10),
            monthlyRevenue:   total(11),
            activeProducts:   cnt(12),
            activeServices:   cnt(13),
            activeBanners:    cnt(14),
            recentActivity:   results[15][0],
        });
    } catch (error) {
        next(error);
    }
};

// ─── Products (Admin CRUD) ────────────────────────────────────────────────────

export const adminListProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const { search, category_id, brand_id, is_active } = req.query;

        const conditions: string[] = [];
        const params: any[] = [];

        if (search) {
            conditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (category_id) { conditions.push('p.category_id = ?'); params.push(Number(category_id)); }
        if (brand_id)    { conditions.push('p.brand_id = ?');    params.push(Number(brand_id)); }
        if (is_active !== undefined && is_active !== '') {
            conditions.push('p.is_active = ?');
            params.push(Number(is_active));
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [countRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM products p ${where}`, params
        );
        const total = Number(countRows[0].total);

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT p.*, pc.name AS category_name, b.name AS brand_name
             FROM products p
             LEFT JOIN product_categories pc ON pc.id = p.category_id
             LEFT JOIN brands b ON b.id = p.brand_id
             ${where}
             ORDER BY p.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return successResponse(res, {
            items: rows,
            pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) { next(error); }
};

export const adminCreateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const { name, description, category_id, brand_id, price, mrp, stock_qty, sku, image_url } = req.body;

        if (!name || price === undefined || price === null) {
            return errorResponse(res, 'name and price are required', 400);
        }

        const [result] = await pool.query<OkPacket>(
            `INSERT INTO products (name, description, category_id, brand_id, price, mrp, stock_qty, sku, image_url, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [name, description ?? null, category_id ?? null, brand_id ?? null,
             price, mrp ?? null, stock_qty ?? 0, sku ?? null, image_url ?? null]
        );

        await logAdminAction(adminId, 'created_product', 'product', result.insertId);
        return successResponse(res, { id: result.insertId }, 'Product created', 201);
    } catch (error) { next(error); }
};

export const adminUpdateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const allowed = ['name', 'description', 'category_id', 'brand_id', 'price', 'mrp', 'stock_qty', 'sku', 'image_url'];
        const fields: string[] = [];
        const values: any[] = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }

        if (fields.length === 0) return errorResponse(res, 'No updatable fields provided', 400);

        values.push(id);
        await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
        await logAdminAction(adminId, 'updated_product', 'product', id);
        return successResponse(res, null, 'Product updated');
    } catch (error) { next(error); }
};

export const adminToggleProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const [rows] = await pool.query<RowDataPacket[]>(`SELECT is_active FROM products WHERE id = ?`, [id]);
        if (rows.length === 0) return errorResponse(res, 'Product not found', 404);

        const newActive = rows[0].is_active ? 0 : 1;
        await pool.query(`UPDATE products SET is_active = ? WHERE id = ?`, [newActive, id]);
        await logAdminAction(adminId, newActive ? 'activated_product' : 'deactivated_product', 'product', id);
        return successResponse(res, { is_active: newActive }, 'Product toggled');
    } catch (error) { next(error); }
};

// ─── Categories (Admin CRUD) ──────────────────────────────────────────────────

export const adminListCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT c.*, p.name AS parent_name
             FROM product_categories c
             LEFT JOIN product_categories p ON p.id = c.parent_id
             ORDER BY c.sort_order ASC, c.id ASC`
        );
        return successResponse(res, rows);
    } catch (error) { next(error); }
};

export const adminCreateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const { name, slug, parent_id, icon_key, sort_order } = req.body;

        if (!name) return errorResponse(res, 'name is required', 400);

        const finalSlug = (slug && String(slug).trim()) ? String(slug).trim() : toSlug(name);

        const [result] = await pool.query<OkPacket>(
            `INSERT INTO product_categories (name, slug, parent_id, icon_key, sort_order, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [name, finalSlug, parent_id ?? null, icon_key ?? null, sort_order ?? 0]
        );

        await logAdminAction(adminId, 'created_category', 'category', result.insertId);
        return successResponse(res, { id: result.insertId, slug: finalSlug }, 'Category created', 201);
    } catch (error) { next(error); }
};

export const adminUpdateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const allowed = ['name', 'slug', 'parent_id', 'icon_key', 'sort_order'];
        const fields: string[] = [];
        const values: any[] = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }

        if (fields.length === 0) return errorResponse(res, 'No updatable fields provided', 400);

        values.push(id);
        await pool.query(`UPDATE product_categories SET ${fields.join(', ')} WHERE id = ?`, values);
        await logAdminAction(adminId, 'updated_category', 'category', id);
        return successResponse(res, null, 'Category updated');
    } catch (error) { next(error); }
};

export const adminToggleCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const [rows] = await pool.query<RowDataPacket[]>(`SELECT is_active FROM product_categories WHERE id = ?`, [id]);
        if (rows.length === 0) return errorResponse(res, 'Category not found', 404);

        const newActive = rows[0].is_active ? 0 : 1;
        await pool.query(`UPDATE product_categories SET is_active = ? WHERE id = ?`, [newActive, id]);
        await logAdminAction(adminId, newActive ? 'activated_category' : 'deactivated_category', 'category', id);
        return successResponse(res, { is_active: newActive }, 'Category toggled');
    } catch (error) { next(error); }
};

// ─── Brands (Admin CRUD) ──────────────────────────────────────────────────────

export const adminListBrands = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM brands ORDER BY name ASC`
        );
        return successResponse(res, rows);
    } catch (error) { next(error); }
};

export const adminCreateBrand = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const { name, slug, logo_url } = req.body;

        if (!name) return errorResponse(res, 'name is required', 400);

        const finalSlug = (slug && String(slug).trim()) ? String(slug).trim() : toSlug(name);

        const [result] = await pool.query<OkPacket>(
            `INSERT INTO brands (name, slug, logo_url, is_active) VALUES (?, ?, ?, 1)`,
            [name, finalSlug, logo_url ?? null]
        );

        await logAdminAction(adminId, 'created_brand', 'brand', result.insertId);
        return successResponse(res, { id: result.insertId, slug: finalSlug }, 'Brand created', 201);
    } catch (error) { next(error); }
};

export const adminUpdateBrand = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const allowed = ['name', 'slug', 'logo_url'];
        const fields: string[] = [];
        const values: any[] = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }

        if (fields.length === 0) return errorResponse(res, 'No updatable fields provided', 400);

        values.push(id);
        await pool.query(`UPDATE brands SET ${fields.join(', ')} WHERE id = ?`, values);
        await logAdminAction(adminId, 'updated_brand', 'brand', id);
        return successResponse(res, null, 'Brand updated');
    } catch (error) { next(error); }
};

export const adminToggleBrand = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const [rows] = await pool.query<RowDataPacket[]>(`SELECT is_active FROM brands WHERE id = ?`, [id]);
        if (rows.length === 0) return errorResponse(res, 'Brand not found', 404);

        const newActive = rows[0].is_active ? 0 : 1;
        await pool.query(`UPDATE brands SET is_active = ? WHERE id = ?`, [newActive, id]);
        await logAdminAction(adminId, newActive ? 'activated_brand' : 'deactivated_brand', 'brand', id);
        return successResponse(res, { is_active: newActive }, 'Brand toggled');
    } catch (error) { next(error); }
};

// ─── Services (Admin CRUD) ────────────────────────────────────────────────────

export const adminListServices = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM services ORDER BY display_order ASC, id ASC`
        );
        return successResponse(res, rows);
    } catch (error) { next(error); }
};

export const adminCreateService = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const { name, description, category, image_url, duration_minutes, base_price } = req.body;

        if (!name || base_price === undefined || base_price === null) {
            return errorResponse(res, 'name and base_price are required', 400);
        }

        const [result] = await pool.query<OkPacket>(
            `INSERT INTO services (name, description, category, image_url, duration_minutes, base_price, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [name, description ?? null, category ?? null, image_url ?? null,
             duration_minutes ?? null, base_price]
        );

        await logAdminAction(adminId, 'created_service', 'service', result.insertId);
        return successResponse(res, { id: result.insertId }, 'Service created', 201);
    } catch (error) { next(error); }
};

export const adminUpdateService = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const allowed = ['name', 'description', 'category', 'image_url', 'duration_minutes', 'base_price', 'display_order'];
        const fields: string[] = [];
        const values: any[] = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }

        if (fields.length === 0) return errorResponse(res, 'No updatable fields provided', 400);

        values.push(id);
        await pool.query(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, values);
        await logAdminAction(adminId, 'updated_service', 'service', id);
        return successResponse(res, null, 'Service updated');
    } catch (error) { next(error); }
};

export const adminToggleService = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const [rows] = await pool.query<RowDataPacket[]>(`SELECT is_active FROM services WHERE id = ?`, [id]);
        if (rows.length === 0) return errorResponse(res, 'Service not found', 404);

        const newActive = rows[0].is_active ? 0 : 1;
        await pool.query(`UPDATE services SET is_active = ? WHERE id = ?`, [newActive, id]);
        await logAdminAction(adminId, newActive ? 'activated_service' : 'deactivated_service', 'service', id);
        return successResponse(res, { is_active: newActive }, 'Service toggled');
    } catch (error) { next(error); }
};

// ─── Banners (Admin CRUD) ─────────────────────────────────────────────────────

export const adminListBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM banners ORDER BY display_order ASC, id DESC`
        );
        return successResponse(res, rows);
    } catch (error) { next(error); }
};

export const adminCreateBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const { title, subtitle, image_url, link_type, link_value, display_order, starts_at, expires_at } = req.body;

        if (!title || !image_url || !link_type) {
            return errorResponse(res, 'title, image_url, and link_type are required', 400);
        }

        let finalOrder: number;
        if (display_order !== undefined && display_order !== null) {
            finalOrder = Number(display_order);
        } else {
            const [orderRows] = await pool.query<RowDataPacket[]>(
                `SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM banners`
            );
            finalOrder = Number(orderRows[0].next);
        }

        const [result] = await pool.query<OkPacket>(
            `INSERT INTO banners
               (title, subtitle, image_url, link_type, link_value, display_order, is_active,
                starts_at, expires_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            [title, subtitle ?? null, image_url, link_type, link_value ?? null,
             finalOrder, starts_at ?? null, expires_at ?? null, adminId]
        );

        await logAdminAction(adminId, 'created_banner', 'banner', result.insertId);
        return successResponse(res, { id: result.insertId }, 'Banner created', 201);
    } catch (error) { next(error); }
};

export const adminUpdateBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const allowed = ['title', 'subtitle', 'image_url', 'link_type', 'link_value',
                         'starts_at', 'expires_at', 'is_active', 'display_order'];
        const fields: string[] = [];
        const values: any[] = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }

        if (fields.length === 0) return errorResponse(res, 'No updatable fields provided', 400);

        values.push(id);
        await pool.query(`UPDATE banners SET ${fields.join(', ')} WHERE id = ?`, values);
        await logAdminAction(adminId, 'updated_banner', 'banner', id);
        return successResponse(res, null, 'Banner updated');
    } catch (error) { next(error); }
};

export const adminReorderBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const order: { id: number; display_order: number }[] = req.body.order;

        if (!Array.isArray(order) || order.length === 0) {
            return errorResponse(res, 'order must be a non-empty array', 400);
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (const item of order) {
                await conn.query(
                    `UPDATE banners SET display_order = ? WHERE id = ?`,
                    [item.display_order, item.id]
                );
            }
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        await logAdminAction(adminId, 'reordered_banners', 'banner');
        return successResponse(res, null, 'Banners reordered');
    } catch (error) { next(error); }
};

export const adminDeleteBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);

        const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM banners WHERE id = ?`, [id]);
        if (rows.length === 0) return errorResponse(res, 'Banner not found', 404);

        await pool.query(`DELETE FROM banners WHERE id = ?`, [id]);
        await logAdminAction(adminId, 'deleted_banner', 'banner', id);
        return successResponse(res, null, 'Banner deleted');
    } catch (error) { next(error); }
};

export const adminUploadBannerImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) return errorResponse(res, 'No image file provided', 400);
        return successResponse(res, { image_url: `/uploads/banners/${req.file.filename}` });
    } catch (error) { next(error); }
};

// ─── Bookings (Admin) ────────────────────────────────────────────────────────

export const adminListBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const { status, date_from, date_to, agent_id } = req.query;

        const conditions: string[] = [];
        const params: any[] = [];

        if (status)    { conditions.push('b.status = ?');             params.push(status); }
        if (agent_id)  { conditions.push('b.agent_id = ?');           params.push(Number(agent_id)); }
        if (date_from) { conditions.push('b.created_at >= ?');        params.push(date_from); }
        if (date_to)   { conditions.push('b.created_at <= ?');        params.push(date_to); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [countRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM bookings b ${where}`, params
        );
        const total = Number(countRows[0].total);

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT b.*,
                    u.full_name  AS customer_name,  u.phone  AS customer_phone,
                    s.name       AS service_name,
                    a.full_name  AS agent_name,
                    addr.line1   AS address_line1,  addr.city AS address_city
             FROM bookings b
             LEFT JOIN users    u    ON u.id    = b.user_id
             LEFT JOIN services s    ON s.id    = b.service_id
             LEFT JOIN users    a    ON a.id    = b.agent_id
             LEFT JOIN addresses addr ON addr.id = b.address_id
             ${where}
             ORDER BY b.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return successResponse(res, {
            items: rows,
            pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) { next(error); }
};

export const adminGetBookingDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = Number(req.params.id);

        const [bookingRows] = await pool.query<RowDataPacket[]>(
            `SELECT b.*,
                    cu.id         AS customer_id,   cu.full_name AS customer_name,
                    cu.phone      AS customer_phone, cu.email     AS customer_email,
                    au.id         AS agent_id_val,   au.full_name AS agent_name,
                    au.phone      AS agent_phone,
                    s.name        AS service_name,   s.category   AS service_category,
                    s.duration_minutes,              s.base_price AS service_base_price,
                    addr.line1, addr.line2, addr.city, addr.state,
                    addr.postal_code, addr.country
             FROM bookings b
             LEFT JOIN users    cu   ON cu.id   = b.user_id
             LEFT JOIN users    au   ON au.id   = b.agent_id
             LEFT JOIN services s    ON s.id    = b.service_id
             LEFT JOIN addresses addr ON addr.id = b.address_id
             WHERE b.id = ?`,
            [id]
        );
        if (bookingRows.length === 0) return errorResponse(res, 'Booking not found', 404);

        const [[paymentRows], [updateRows]] = await Promise.all([
            pool.query<RowDataPacket[]>(
                `SELECT * FROM payments
                 WHERE entity_type = 'booking' AND entity_id = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [id]
            ),
            pool.query<RowDataPacket[]>(
                `SELECT bu.*, u.full_name AS agent_name
                 FROM booking_updates bu
                 LEFT JOIN users u ON u.id = bu.agent_id
                 WHERE bu.booking_id = ?
                 ORDER BY bu.created_at ASC`,
                [id]
            ),
        ]);

        return successResponse(res, {
            ...bookingRows[0],
            payment: paymentRows[0] ?? null,
            updates: updateRows,
        });
    } catch (error) { next(error); }
};

export const adminAssignBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);
        const { agent_id } = req.body;

        if (!agent_id) return errorResponse(res, 'agent_id is required', 400);

        const [agentRows] = await pool.query<RowDataPacket[]>(
            `SELECT id FROM users WHERE id = ? AND role = 'agent'`, [agent_id]
        );
        if (agentRows.length === 0) return errorResponse(res, 'Agent not found', 404);

        await pool.query(
            `UPDATE bookings SET agent_id = ?, status = 'assigned', assigned_at = NOW() WHERE id = ?`,
            [agent_id, id]
        );

        await logAdminAction(adminId, 'assigned_booking', 'booking', id, { agent_id: Number(agent_id) });
        return successResponse(res, null, 'Booking assigned');
    } catch (error) { next(error); }
};

export const adminCancelBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);
        const { reason } = req.body;

        if (!reason || String(reason).trim() === '') {
            return errorResponse(res, 'reason is required', 400);
        }

        const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM bookings WHERE id = ?`, [id]);
        if (rows.length === 0) return errorResponse(res, 'Booking not found', 404);

        await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [id]);
        await logAdminAction(adminId, 'cancelled_booking', 'booking', id, { reason });
        return successResponse(res, null, 'Booking cancelled');
    } catch (error) { next(error); }
};

// ─── Orders (Admin) ───────────────────────────────────────────────────────────

const ORDER_TRANSITIONS: Record<string, string[]> = {
    'paid':    ['packed', 'cancelled'],
    'packed':  ['shipped', 'cancelled'],
    'shipped': ['delivered'],
};

export const adminListOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const { status, payment_status, date_from, date_to } = req.query;

        const conditions: string[] = [];
        const params: any[] = [];

        if (status)         { conditions.push('o.status = ?');          params.push(status); }
        if (payment_status) { conditions.push('o.payment_status = ?');  params.push(payment_status); }
        if (date_from)      { conditions.push('o.created_at >= ?');     params.push(date_from); }
        if (date_to)        { conditions.push('o.created_at <= ?');     params.push(date_to); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [countRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM orders o ${where}`, params
        );
        const total = Number(countRows[0].total);

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT o.*,
                    u.full_name AS customer_name,
                    u.phone     AS customer_phone
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             ${where}
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return successResponse(res, {
            items: rows,
            pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) { next(error); }
};

export const adminGetOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = Number(req.params.id);

        const [orderRows] = await pool.query<RowDataPacket[]>(
            `SELECT o.*,
                    u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
                    a.label     AS address_label, a.line1,   a.line2,
                    a.city,     a.state,          a.postal_code, a.country
             FROM orders o
             LEFT JOIN users     u ON u.id = o.user_id
             LEFT JOIN addresses a ON a.id = o.address_id
             WHERE o.id = ?`,
            [id]
        );
        if (orderRows.length === 0) return errorResponse(res, 'Order not found', 404);

        const [[itemRows], [paymentRows]] = await Promise.all([
            pool.query<RowDataPacket[]>(
                `SELECT oi.*, p.name AS product_name, p.image_url
                 FROM order_items oi
                 LEFT JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id = ?
                 ORDER BY oi.id ASC`,
                [id]
            ),
            pool.query<RowDataPacket[]>(
                `SELECT * FROM payments
                 WHERE entity_type = 'order' AND entity_id = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [id]
            ),
        ]);

        return successResponse(res, {
            ...orderRows[0],
            items: itemRows,
            payment: paymentRows[0] ?? null,
        });
    } catch (error) { next(error); }
};

export const adminUpdateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminId = (req.user as any).id;
        const id = Number(req.params.id);
        const { status: newStatus } = req.body;

        if (!newStatus) return errorResponse(res, 'status is required', 400);

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT status FROM orders WHERE id = ?`, [id]
        );
        if (rows.length === 0) return errorResponse(res, 'Order not found', 404);

        const currentStatus: string = rows[0].status;
        const allowed = ORDER_TRANSITIONS[currentStatus] ?? [];

        if (!allowed.includes(newStatus)) {
            return errorResponse(
                res,
                `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
                400
            );
        }

        await pool.query(`UPDATE orders SET status = ? WHERE id = ?`, [newStatus, id]);
        await logAdminAction(adminId, 'updated_order_status', 'order', id, { from: currentStatus, to: newStatus });
        return successResponse(res, { status: newStatus }, 'Order status updated');
    } catch (error) { next(error); }
};

// ─── Public Banner Endpoint ───────────────────────────────────────────────────

export const getActiveBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM banners
             WHERE is_active = 1
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY display_order ASC`
        );
        return successResponse(res, rows);
    } catch (error) { next(error); }
};
