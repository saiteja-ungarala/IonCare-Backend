-- AquaCare Database Schema
-- Run this file to create all required tables

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
    address_id INT,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    status ENUM('pending','confirmed','assigned','in_progress','completed','cancelled') DEFAULT 'pending',
    price DECIMAL(10,2) NOT NULL,
    notes TEXT,
    cancel_reason VARCHAR(255) NULL,
    cancelled_by INT NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
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
