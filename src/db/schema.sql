-- ============================================================================
-- Supermarket Database Schema - PostgreSQL DDL
-- Tables: product_categories, supermarket_products, scannable_codes
-- Performance: B-Tree lookup index on scannable_codes(code_payload)
-- ============================================================================

-- 1. Create a table for product categories
CREATE TABLE IF NOT EXISTS product_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

-- 2. Create the main supermarket product inventory catalog
CREATE TABLE IF NOT EXISTS supermarket_products (
    product_id SERIAL PRIMARY KEY,
    category_id INT REFERENCES product_categories(category_id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    brand_name VARCHAR(100),
    retail_price NUMERIC(10, 2) NOT NULL,
    stock_quantity INT DEFAULT 0 CHECK (stock_quantity >= 0),
    product_description TEXT,
    image_url VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create a dedicated table for scannable identifiers (Barcodes and QR Codes)
CREATE TABLE IF NOT EXISTS scannable_codes (
    code_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES supermarket_products(product_id) ON DELETE CASCADE,
    code_payload VARCHAR(512) NOT NULL UNIQUE, -- The string read by the physical/mobile scanner
    code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('QR_CODE', 'EAN_13', 'UPC', 'CODE_128')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. CRITICAL Performance Optimization: Add a B-Tree index for instantaneous scan lookups
CREATE INDEX IF NOT EXISTS idx_scannable_codes_lookup ON scannable_codes(code_payload);

-- 5. User Management Table: app_users
-- Handles authentication mapping, roles (admin, store_owner, vendor, cashier), and active state
CREATE TABLE IF NOT EXISTS app_users (
    user_id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'store_owner' CHECK (role IN ('admin', 'store_owner', 'vendor', 'cashier')),
    phone VARCHAR(50),
    store_name VARCHAR(255),
    password_hash TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_uid ON app_users(firebase_uid);

-- PostgreSQL-backed login sessions. Tokens are stored hashed and sent to the browser as HTTP-only cookies.
CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

-- 6. Vendor Management Table: vendors
-- Tracks suppliers, contact points, supplied inventory categories, payment terms, and status
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),
    supplied_categories VARCHAR(255),
    payment_terms VARCHAR(100) DEFAULT 'Net 30',
    lead_time_days INT DEFAULT 3,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(vendor_name);

-- 7. Subscription Enabled Management Table: store_subscriptions
-- Governs inventory access, subscription enablement, feature flags, plan tiers, and validity
CREATE TABLE IF NOT EXISTS store_subscriptions (
    subscription_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES app_users(user_id) ON DELETE CASCADE,
    firebase_uid VARCHAR(128),
    plan_name VARCHAR(100) NOT NULL,
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'basic' CHECK (plan_tier IN ('basic', 'pro', 'enterprise')),
    billing_cycle VARCHAR(50) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    price NUMERIC(10, 2) NOT NULL DEFAULT 2499.00,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trial', 'expired', 'cancelled')),
    is_enabled BOOLEAN DEFAULT TRUE,
    inventory_limit INT DEFAULT 500,
    features_enabled JSONB DEFAULT '["inventory_management", "barcode_scanner", "qr_shelf_tags", "daily_sales_analytics"]'::jsonb,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    last_payment_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_store_subscriptions_user ON store_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_store_subscriptions_uid ON store_subscriptions(firebase_uid);

-- ============================================================================
-- Sample Initial Seed Data
-- ============================================================================

INSERT INTO product_categories (category_name, description)
VALUES 
    ('Dairy & Eggs', 'Milk, yogurt, cheeses, fresh butter, and eggs'),
    ('Bakery & Snacks', 'Artisan breads, biscuits, chips, and quick bites'),
    ('Beverages', 'Cold drinks, juices, coffee, tea, and energy beverages'),
    ('Pantry & Staples', 'Grains, pulses, cooking oils, spices, and sauces'),
    ('Fresh Produce', 'Organic fruits, leafy greens, and farm vegetables')
ON CONFLICT (category_name) DO NOTHING;

-- Sample Products
INSERT INTO supermarket_products (category_id, product_name, brand_name, retail_price, stock_quantity, product_description)
VALUES
    (1, 'Farm Fresh Whole Milk 1L', 'Amul / Mother Dairy', 64.00, 120, 'Pasteurized homogenized full-cream cow milk'),
    (1, 'Greek Yogurt Plain 400g', 'Epigamia', 110.00, 45, 'High protein strained plain Greek yogurt'),
    (2, 'Multigrain Sourdough Bread 400g', 'Bonn Bakers', 55.00, 30, 'Naturally fermented high-fiber artisanal sourdough'),
    (3, 'Sparkling Lime Soda 500ml', 'Schweppes', 40.00, 80, 'Crisp carbonated lime refreshing beverage'),
    (4, 'Cold Pressed Olive Oil 500ml', 'Borges', 450.00, 25, 'Extra virgin first cold-pressed Mediterranean olive oil')
ON CONFLICT DO NOTHING;

-- Sample Scannable Codes (QR and Barcodes)
INSERT INTO scannable_codes (product_id, code_payload, code_type, is_active)
VALUES
    (1, 'ITEM-MILK-101', 'QR_CODE', TRUE),
    (1, '8901262010015', 'EAN_13', TRUE),
    (2, 'ITEM-YOGURT-202', 'QR_CODE', TRUE),
    (3, 'ITEM-BREAD-303', 'QR_CODE', TRUE),
    (4, 'ITEM-SODA-404', 'QR_CODE', TRUE),
    (5, 'ITEM-OIL-505', 'QR_CODE', TRUE)
ON CONFLICT (code_payload) DO NOTHING;

-- Seed Admin and Sample Store Owner Users
INSERT INTO app_users (email, full_name, role, phone, store_name, is_active)
VALUES 
    ('suryavamshicv@gmail.com', 'System Super Administrator', 'admin', '+91 9876543210', 'Headquarters Central Ops', TRUE),
    ('admin@supermarket.com', 'Primary Ops Admin', 'admin', '+91 9876543211', 'Metro Retail Hub', TRUE),
    ('owner@freshstore.com', 'Rajesh Sharma', 'store_owner', '+91 9811223344', 'Fresh Mart Supermarket', TRUE),
    ('unsubscribed@store.com', 'Anita Verma', 'store_owner', '+91 9822334455', 'Verma Mini Mart', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Seed Sample Vendors
INSERT INTO vendors (vendor_name, contact_person, email, phone, address, tax_id, supplied_categories, payment_terms, lead_time_days, status)
VALUES
    ('Amul Dairy Distribution Ltd', 'Sanjay Patel', 'orders@amuldairy.com', '+91 9825012345', 'Anand GIDC Industrial Area, Gujarat', 'GSTIN24AAACA1234F1Z5', 'Dairy & Eggs', 'Net 15', 1, 'active'),
    ('Bonn Food Specialties', 'Harmit Singh', 'wholesale@bonnbread.com', '+91 9814012345', 'Focal Point, Ludhiana, Punjab', 'GSTIN03AAACB2345G1Z6', 'Bakery & Snacks', 'Net 30', 2, 'active'),
    ('Beverage Hub National', 'Ramesh Rao', 'supply@beveragehub.in', '+91 9880012345', 'Whitefield Logistics Park, Bengaluru', 'GSTIN29AAACC3456H1Z7', 'Beverages', 'Net 21', 2, 'active'),
    ('Himalayan Agro Produce', 'Deepak Joshi', 'farmers@himalayanagro.in', '+91 9412012345', 'Dehradun Mandi Yard, Uttarakhand', 'GSTIN05AAACD4567J1Z8', 'Fresh Produce, Pantry & Staples', 'Cash on Delivery', 3, 'active')
ON CONFLICT DO NOTHING;

-- Seed Sample Subscriptions
INSERT INTO store_subscriptions (user_id, plan_name, plan_tier, price, status, is_enabled, inventory_limit)
SELECT user_id, 'Professional Supermarket Plan', 'pro', 5999.00, 'active', TRUE, 5000
FROM app_users WHERE email = 'owner@freshstore.com'
ON CONFLICT DO NOTHING;

INSERT INTO store_subscriptions (user_id, plan_name, plan_tier, price, status, is_enabled, inventory_limit)
SELECT user_id, 'Basic Plan (Unpaid / Inactive)', 'basic', 2499.00, 'inactive', FALSE, 500
FROM app_users WHERE email = 'unsubscribed@store.com'
ON CONFLICT DO NOTHING;
