-- IonCare Database Schema
-- Run this file to create all required tables

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM('customer','technician','dealer','admin') NOT NULL DEFAULT 'customer',
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    referral_code VARCHAR(20) NULL,
    referred_by INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    reset_token VARCHAR(255) NULL,
    reset_token_expires DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_referral_code (referral_code),
    CONSTRAINT fk_users_referred_by FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    refresh_token VARCHAR(500) NOT NULL,
    user_agent TEXT NULL,
    ip_address VARCHAR(50) NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_auth_sessions_refresh_token (refresh_token),
    INDEX idx_auth_sessions_user_id (user_id),
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    label VARCHAR(50),
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(50) DEFAULT 'India',
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    image_url VARCHAR(500),
    duration_minutes INT DEFAULT 60,
    base_price DECIMAL(10,2) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    technician_id INT NULL,
    address_id INT,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    status ENUM('pending','confirmed','assigned','in_progress','completed','cancelled') DEFAULT 'pending',
    price DECIMAL(10,2) NOT NULL,
    notes TEXT,
    assigned_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancel_reason VARCHAR(300) NULL,
    cancelled_by INT NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bookings_technician_id (technician_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
);

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

-- Dealer module tables
CREATE TABLE IF NOT EXISTS dealer_profiles (
    user_id INT PRIMARY KEY,
    verification_status ENUM('unverified','pending','approved','rejected') NOT NULL DEFAULT 'pending',
    business_name VARCHAR(120) NULL,
    gst_number VARCHAR(30) NULL,
    address_text TEXT NULL,
    base_lat DECIMAL(10,7) NULL,
    base_lng DECIMAL(10,7) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dealer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dealer_kyc_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_id INT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    review_notes TEXT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dealer_kyc_dealer_id (dealer_id),
    INDEX idx_dealer_kyc_status (status),
    CONSTRAINT fk_dealer_kyc_dealer FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dealer_kyc_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dealer_product_pricing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_id INT NOT NULL,
    product_id INT NOT NULL,
    dealer_price DECIMAL(10,2) NOT NULL,
    margin_type ENUM('flat','percent') NULL,
    margin_value DECIMAL(10,2) NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dealer_product_pricing (dealer_id, product_id),
    INDEX idx_dealer_product_pricing_dealer (dealer_id),
    INDEX idx_dealer_product_pricing_product (product_id),
    CONSTRAINT fk_dealer_product_pricing_dealer FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dealer_product_pricing_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dealer_pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_id INT NOT NULL,
    margin_type ENUM('flat','percent') NULL,
    margin_value DECIMAL(10,2) NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dealer_pricing_rules_dealer (dealer_id),
    CONSTRAINT fk_dealer_pricing_rules_dealer FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE
);
