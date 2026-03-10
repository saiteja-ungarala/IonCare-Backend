-- Migration 006: Add cancellation fields to bookings and orders
-- Run once against the production/dev database.

ALTER TABLE bookings
    ADD COLUMN cancel_reason  VARCHAR(300)     DEFAULT NULL,
    ADD COLUMN cancelled_by   BIGINT UNSIGNED  DEFAULT NULL,
    ADD COLUMN cancelled_at   TIMESTAMP        NULL DEFAULT NULL;

ALTER TABLE orders
    ADD COLUMN cancel_reason  VARCHAR(300)     DEFAULT NULL,
    ADD COLUMN cancelled_by   BIGINT UNSIGNED  DEFAULT NULL,
    ADD COLUMN cancelled_at   TIMESTAMP        NULL DEFAULT NULL;
