-- Migration 009: Add missing tables and columns for existing databases
-- Safe to run on databases that already ran migrations 001-008.
-- All operations are idempotent.

DELIMITER $$

-- Helper: add a column to a table only if it doesn't already exist
DROP PROCEDURE IF EXISTS add_column_if_missing $$
CREATE PROCEDURE add_column_if_missing(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition TEXT
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = p_table
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

-- ── bookings: technician_id ──────────────────────────────────────────────────
-- (Migration 007 renamed agent_id → technician_id; fresh installs post-007
--  get it from schema.sql. This covers DBs that skipped those paths.)
CALL add_column_if_missing('bookings', 'technician_id', 'INT NULL AFTER service_id');

-- Index technician_id once the column exists
SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'bookings'
      AND index_name = 'idx_bookings_technician_id'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE `bookings` ADD INDEX `idx_bookings_technician_id` (`technician_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── bookings: assigned_at ────────────────────────────────────────────────────
CALL add_column_if_missing('bookings', 'assigned_at', 'DATETIME NULL AFTER notes');

-- ── bookings: completed_at ───────────────────────────────────────────────────
CALL add_column_if_missing('bookings', 'completed_at', 'DATETIME NULL AFTER assigned_at');

-- ── bookings: updated_at ─────────────────────────────────────────────────────
CALL add_column_if_missing('bookings', 'updated_at',
    'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');

-- ── booking_offers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    technician_id INT NOT NULL,
    status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    offered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_booking_offers_booking_technician (booking_id, technician_id),
    INDEX idx_booking_offers_technician_id (technician_id),
    INDEX idx_booking_offers_status (status),
    CONSTRAINT fk_booking_offers_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_offers_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE CASCADE
);

-- If booking_offers already existed without offered_at/responded_at columns, add them:
CALL add_column_if_missing('booking_offers', 'offered_at',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status');
CALL add_column_if_missing('booking_offers', 'responded_at',
    'DATETIME NULL AFTER offered_at');

-- ── booking_updates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    technician_id INT NOT NULL,
    update_type ENUM('arrived','diagnosed','in_progress','completed','photo','note') NOT NULL,
    note TEXT NULL,
    media_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_booking_updates_booking_id (booking_id),
    INDEX idx_booking_updates_technician_id (technician_id),
    CONSTRAINT fk_booking_updates_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_updates_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── technician_profiles ──────────────────────────────────────────────────────
-- Created here for databases where migration 007's rename found no source table.
CREATE TABLE IF NOT EXISTS technician_profiles (
    user_id INT PRIMARY KEY,
    verification_status ENUM('unverified','pending','approved','rejected','suspended') NOT NULL DEFAULT 'unverified',
    is_online TINYINT(1) NOT NULL DEFAULT 0,
    service_radius_km DECIMAL(6,2) NOT NULL DEFAULT 10,
    base_lat DECIMAL(10,7) NULL,
    base_lng DECIMAL(10,7) NULL,
    last_online_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_technician_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── technician_kyc_documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technician_kyc_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    technician_id INT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    review_notes TEXT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_technician_kyc_technician_id (technician_id),
    INDEX idx_technician_kyc_status (status),
    CONSTRAINT fk_technician_kyc_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_technician_kyc_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── technician_profiles: add suspended to enum if missing ────────────────────
-- Only needed if the table existed before this migration and used the old enum.
-- MySQL silently ignores ALTER MODIFY if the enum already contains the value.
ALTER TABLE technician_profiles
    MODIFY verification_status
    ENUM('unverified','pending','approved','rejected','suspended') NOT NULL DEFAULT 'unverified';

-- ── Clean up helper procedure ────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS add_column_if_missing;
