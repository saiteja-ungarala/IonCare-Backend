-- Migration 005: Add password reset columns to users table
-- Run once against the aquacare database

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100) NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL DEFAULT NULL;
