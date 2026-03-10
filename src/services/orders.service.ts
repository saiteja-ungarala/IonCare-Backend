import pool from '../config/db';
import { OrderModel, OrderItem } from '../models/order.model';
import { CartModel } from '../models/cart.model';
import { AddressModel } from '../models/address.model';
import { WalletModel } from '../models/wallet.model';
import { ORDER_STATUS } from '../config/constants';
import { ReferralCommissionService } from './referralCommission.service';

const ACTIVE_ORDER_STATUSES = new Set(['pending', 'confirmed', 'paid', 'processing', 'packed', 'shipped']);
const DELIVERED_ORDER_STATUSES = new Set(['delivered', 'completed']);
const CANCELLED_ORDER_STATUSES = new Set(['cancelled', 'refunded']);

const normalizeStatus = (status?: string): string => (status || 'pending').toLowerCase();

const mapOrderStatusBucket = (status?: string): 'active' | 'delivered' | 'cancelled' => {
    const normalized = normalizeStatus(status);
    if (DELIVERED_ORDER_STATUSES.has(normalized)) return 'delivered';
    if (CANCELLED_ORDER_STATUSES.has(normalized)) return 'cancelled';
    if (ACTIVE_ORDER_STATUSES.has(normalized)) return 'active';
    return 'active';
};

const mapOrderSummary = (order: any) => ({
    id: Number(order.id),
    user_id: Number(order.user_id),
    address_id: order.address_id ?? null,
    status: normalizeStatus(order.status),
    status_bucket: mapOrderStatusBucket(order.status),
    payment_status: normalizeStatus(order.payment_status),
    subtotal: Number(order.subtotal ?? 0),
    delivery_fee: Number(order.delivery_fee ?? 0),
    discount: Number(order.discount ?? 0),
    total_amount: Number(order.total_amount ?? 0),
    created_at: order.created_at,
    updated_at: order.updated_at ?? null,
    referred_by_agent_id: order.referred_by_agent_id ?? null,
    referral_code_used: order.referral_code_used ?? null,
    item_count: Number(order.item_count ?? 0),
    first_item: order.first_product_name || order.first_product_image
        ? {
            product_name: order.first_product_name ?? null,
            image_url: order.first_product_image ?? null,
        }
        : null,
});

const mapOrderDetail = (order: any) => ({
    id: Number(order.id),
    user_id: Number(order.user_id),
    address_id: order.address_id ?? null,
    status: normalizeStatus(order.status),
    status_bucket: mapOrderStatusBucket(order.status),
    payment_status: normalizeStatus(order.payment_status),
    subtotal: Number(order.subtotal ?? 0),
    delivery_fee: Number(order.delivery_fee ?? 0),
    discount: Number(order.discount ?? 0),
    total_amount: Number(order.total_amount ?? 0),
    created_at: order.created_at,
    updated_at: order.updated_at ?? null,
    referred_by_agent_id: order.referred_by_agent_id ?? null,
    referral_code_used: order.referral_code_used ?? null,
    address: order.address,
    items: Array.isArray(order.items)
        ? order.items.map((item: any) => ({
            id: Number(item.id),
            order_id: Number(item.order_id),
            product_id: Number(item.product_id),
            qty: Number(item.qty ?? 0),
            unit_price: Number(item.unit_price ?? 0),
            line_total: Number(item.line_total ?? 0),
            product_name: item.product_name ?? null,
            image_url: item.image_url ?? null,
        }))
        : [],
});

export const OrderService = {
    async getOrders(userId: number, query: any) {
        const page = parseInt(query.page as string) || 1;
        const limit = parseInt(query.pageSize as string) || 20;
        const offset = (page - 1) * limit;

        const { orders, total } = await OrderModel.findByUser(userId, limit, offset);
        const mappedOrders = orders.map(mapOrderSummary);

        return {
            data: mappedOrders,
            pagination: {
                page,
                pageSize: limit,
                totalItems: total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },

    async getOrderById(userId: number, orderId: number) {
        const order = await OrderModel.findById(orderId);
        if (!order) throw { type: 'AppError', message: 'Order not found', statusCode: 404 };
        if (order.user_id !== userId) throw { type: 'AppError', message: 'Unauthorized', statusCode: 403 };
        return mapOrderDetail(order);
    },

    async cancelOrder(userId: number, orderId: number, reason: string) {
        if (!reason?.trim()) {
            throw { type: 'AppError', message: 'Cancellation reason is required', statusCode: 400 };
        }

        const order = await OrderModel.findById(orderId);
        if (!order) throw { type: 'AppError', message: 'Order not found', statusCode: 404 };
        if (Number(order.user_id) !== userId) throw { type: 'AppError', message: 'Forbidden', statusCode: 403 };
        if (order.status !== 'pending' && order.status !== 'paid') {
            throw { type: 'AppError', message: 'Cannot cancel an order that is already packed/shipped/delivered/cancelled', statusCode: 400 };
        }

        // Cancel the order and record reason
        await pool.query(
            `UPDATE orders
             SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW()
             WHERE id = ?`,
            [reason.trim(), userId, orderId]
        );

        // Refund to wallet if the order was already paid
        let refunded = false;
        let refundAmount = 0;
        if (order.payment_status === 'paid') {
            refundAmount = Number(order.total_amount);
            await WalletModel.creditWithIdempotency(userId, {
                amount: refundAmount,
                txn_type: 'credit',
                source: 'refund',
                idempotency_key: `order_cancel:${orderId}`,
            });
            refunded = true;
        }

        return { success: true, refunded, refund_amount: refundAmount };
    },

    async checkout(userId: number, data: { address_id: number; payment_method: string; referral_code?: string }) {
        // 1. Validate Address
        const address = await AddressModel.findById(data.address_id);
        if (!address || address.user_id !== userId) throw { type: 'AppError', message: 'Invalid address', statusCode: 400 };

        // 2. Get Cart
        const cart = await CartModel.findOpenCart(userId);
        if (!cart) throw { type: 'AppError', message: 'Cart is empty', statusCode: 400 };

        const items = await CartModel.getCartItems(cart.id);
        const productItems = items.filter(i => i.item_type === 'product');

        if (productItems.length === 0) {
            throw { type: 'AppError', message: 'No products in cart to checkout', statusCode: 400 };
        }

        // 3. Calculate Totals
        let subtotal = 0;
        const orderItems: OrderItem[] = [];

        for (const item of productItems) {
            // Here we should strictly check stock in a real app
            subtotal += Number(item.product_price) * item.qty;
            orderItems.push({
                order_id: 0, // placeholder
                product_id: item.product_id,
                qty: item.qty,
                unit_price: item.product_price,
                line_total: Number(item.product_price) * item.qty
            });
        }

        const deliveryFee = subtotal > 500 ? 0 : 50; // Simple rule
        const totalAmount = subtotal + deliveryFee;
        const normalizedReferralCode = ReferralCommissionService.normalizeReferralCode(data.referral_code);
        const validReferralCode = ReferralCommissionService.isValidReferralCodeFormat(normalizedReferralCode)
            ? normalizedReferralCode
            : null;

        // 4. Create Order Transaction
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const referredByAgentId = await ReferralCommissionService.findAgentIdByReferralCode(connection, validReferralCode);
            const referralCodeUsed = referredByAgentId ? validReferralCode : null;

            // Check Wallet if needed
            if (data.payment_method === 'wallet') {
                const balance = await WalletModel.getBalance(userId);
                if (balance < totalAmount) {
                    throw { type: 'AppError', message: 'Insufficient wallet balance', statusCode: 400 };
                }
                // Debit Wallet
                await connection.query(
                    `INSERT INTO wallet_transactions (user_id, txn_type, source, reference_type, amount, description) 
                 VALUES (?, 'debit', 'order_payment', 'order', ?, 'Order Payment')`,
                    [userId, totalAmount]
                );
                await connection.query('UPDATE wallets SET balance = balance - ? WHERE user_id = ?', [totalAmount, userId]);
            }

            // Create Order
            const [orderResult] = await connection.query<any>(
                `INSERT INTO orders (user_id, address_id, status, payment_status, subtotal, delivery_fee, total_amount, referred_by_agent_id, referral_code_used) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, data.address_id, ORDER_STATUS.PENDING,
                    data.payment_method === 'wallet' ? 'paid' : 'pending',
                    subtotal, deliveryFee, totalAmount, referredByAgentId, referralCodeUsed
                ]
            );
            const orderId = orderResult.insertId;

            // Create Order Items
            const itemValues = orderItems.map(item => [orderId, item.product_id, item.qty, item.unit_price, item.line_total]);
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, qty, unit_price, line_total) VALUES ?`,
                [itemValues]
            );

            // Generate referral-attributed commissions in the same DB transaction.
            await ReferralCommissionService.generateCommissionsForOrder(connection, {
                orderId,
                agentId: referredByAgentId,
            });

            // Update Wallet Reference ID if wallet payment
            if (data.payment_method === 'wallet') {
                await connection.query('UPDATE wallet_transactions SET reference_id = ? WHERE reference_type = "order" AND reference_id IS NULL AND user_id = ? ORDER BY id DESC LIMIT 1', [orderId, userId]);
            }

            // Clear ONLY product items from cart (keep service items for bookings)
            await connection.query(
                `DELETE FROM cart_items WHERE cart_id = ? AND item_type = 'product'`,
                [cart.id]
            );

            await connection.commit();

            return {
                orderId,
                totalAmount,
                status: 'pending',
                paymentStatus: data.payment_method === 'wallet' ? 'paid' : 'pending',
                referred_by_agent_id: referredByAgentId,
                referral_code_used: referralCodeUsed,
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
};
