-- Migration 010: Add time_slot_end to bookings for scheduled service support
-- time_slot_end marks when the service window closes (start + service duration).
-- Nullable so existing rows are unaffected; application backfills on write.
-- Idempotent: safe to run on any database that has run migrations 001-009.

DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_missing $$
CREATE PROCEDURE add_column_if_missing(
    IN p_table  VARCHAR(64),
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

-- Add time_slot_end immediately after scheduled_time
CALL add_column_if_missing('bookings', 'time_slot_end', 'TIME NULL AFTER scheduled_time');

DROP PROCEDURE IF EXISTS add_column_if_missing;
