"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TXN_SOURCE = exports.TXN_TYPE = exports.CART_STATUS = exports.ORDER_STATUS = exports.SCHEDULE_EARLY_START_BUFFER_MINUTES = exports.BOOKING_STATUS = exports.ROLES = void 0;
exports.ROLES = {
    CUSTOMER: 'customer',
    TECHNICIAN: 'technician',
    DEALER: 'dealer',
    ADMIN: 'admin',
};
exports.BOOKING_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
};
// How many minutes before the scheduled start time a technician is allowed to
// begin the job. Raise this value to give technicians more lead time.
exports.SCHEDULE_EARLY_START_BUFFER_MINUTES = 15;
exports.ORDER_STATUS = {
    PENDING: 'pending',
    PAID: 'paid',
    PACKED: 'packed',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
};
exports.CART_STATUS = {
    OPEN: 'open',
    CHECKED_OUT: 'checked_out',
    ABANDONED: 'abandoned',
};
exports.TXN_TYPE = {
    CREDIT: 'credit',
    DEBIT: 'debit'
};
exports.TXN_SOURCE = {
    RECHARGE: 'recharge',
    BOOKING_PAYMENT: 'booking_payment',
    ORDER_PAYMENT: 'order_payment',
    REFUND: 'refund',
    REFERRAL_BONUS: 'referral_bonus',
    ADJUSTMENT: 'adjustment'
};
