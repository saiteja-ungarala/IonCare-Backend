export const ROLES = {
    CUSTOMER: 'customer',
    TECHNICIAN: 'technician',
    DEALER: 'dealer',
    ADMIN: 'admin',
} as const;

export const BOOKING_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
} as const;

// How many minutes before the scheduled start time a technician is allowed to
// begin the job. Raise this value to give technicians more lead time.
export const SCHEDULE_EARLY_START_BUFFER_MINUTES = 15;

export const ORDER_STATUS = {
    PENDING: 'pending',
    PAID: 'paid',
    PACKED: 'packed',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
} as const;

export const CART_STATUS = {
    OPEN: 'open',
    CHECKED_OUT: 'checked_out',
    ABANDONED: 'abandoned',
} as const;

export const TXN_TYPE = {
    CREDIT: 'credit',
    DEBIT: 'debit'
} as const;

export const TXN_SOURCE = {
    RECHARGE: 'recharge',
    BOOKING_PAYMENT: 'booking_payment',
    ORDER_PAYMENT: 'order_payment',
    REFUND: 'refund',
    REFERRAL_BONUS: 'referral_bonus',
    ADJUSTMENT: 'adjustment'
} as const;
