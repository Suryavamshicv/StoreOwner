import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://bb2e3f978f72c43d44d19fee003a89faae7468dd83f222069bba1fb32291e11e:sk_vwVGah0BN_6WrOlxRENnS@db.prisma.io:5432/postgres?sslmode=require';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

const subscriptionPlans = {
  basic: { name: 'Basic', price: 100, inventoryLimit: 500 },
  pro: { name: 'Professional', price: 200, inventoryLimit: 999999 }
} as const;

const SESSION_COOKIE = 'store_owner_session';
const SESSION_DAYS = 30;

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedKey] = storedHash.split(':');
  if (!salt || !expectedKey) return false;
  const actualKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actualKey, 'hex'), Buffer.from(expectedKey, 'hex'));
}

function getSessionToken(req: express.Request): string | null {
  const cookies = String(req.headers.cookie || '').split(';');
  const sessionCookie = cookies.find(cookie => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
  return sessionCookie ? decodeURIComponent(sessionCookie.trim().slice(SESSION_COOKIE.length + 1)) : null;
}

function setSessionCookie(res: express.Response, token: string) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DAYS} days')`,
    [userId, tokenHash]
  );
  return token;
}

async function getSessionUser(req: express.Request) {
  const token = getSessionToken(req);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await pool.query(
    `SELECT u.* FROM auth_sessions s JOIN app_users u ON u.user_id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (error) => {
  console.error('PostgreSQL pool connection error:', error.message);
});

// Test connection and auto-migrate tables on startup
async function initDatabaseTables() {
  try {
    // 1. Categories, Products, Scannable Codes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        category_id SERIAL PRIMARY KEY,
        category_name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT
      );
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
      CREATE TABLE IF NOT EXISTS scannable_codes (
        code_id SERIAL PRIMARY KEY,
        product_id INT REFERENCES supermarket_products(product_id) ON DELETE CASCADE,
        code_payload VARCHAR(512) NOT NULL UNIQUE,
        code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('QR_CODE', 'EAN_13', 'UPC', 'CODE_128')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_scannable_codes_lookup ON scannable_codes(code_payload);
    `);

    // 2. User Management Table: app_users
    await pool.query(`
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
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      CREATE TABLE IF NOT EXISTS auth_sessions (
        session_id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
    `);

    // 3. Vendor Management Table: vendors
    await pool.query(`
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
    `);

    // 4. Subscription Enabled Management Table: store_subscriptions
    await pool.query(`
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
    `);

    // 5. Seed default admin & initial vendors (Grant admin access to 9739765357)
    await pool.query(`
      INSERT INTO app_users (email, full_name, role, phone, store_name, is_active)
      VALUES 
        ('9739765357@supermarket.com', 'Admin 9739765357', 'admin', '9739765357', 'Supermarket Operations Admin', TRUE),
        ('owner@freshstore.com', 'Rajesh Sharma', 'store_owner', '+91 9811223344', 'Fresh Mart Supermarket', TRUE),
        ('unsubscribed@store.com', 'Anita Verma', 'store_owner', '+91 9822334455', 'Verma Mini Mart', TRUE)
      ON CONFLICT (email) DO UPDATE SET 
        role = 'admin', 
        phone = COALESCE(EXCLUDED.phone, app_users.phone),
        is_active = TRUE 
      WHERE app_users.email = '9739765357@supermarket.com';

      -- Ensure any user with phone or email 9739765357 has admin access
      UPDATE app_users 
      SET role = 'admin', is_active = TRUE 
      WHERE phone LIKE '%9739765357%' OR email LIKE '%9739765357%';

      UPDATE app_users
      SET password_hash = '${hashPassword('AdminStore#9739765357')}'
      WHERE phone LIKE '%9739765357%' OR email LIKE '%9739765357%'
        AND (password_hash IS NULL OR password_hash = '');

      -- Ensure 9739765357 has active enterprise subscription
      INSERT INTO store_subscriptions (user_id, plan_name, plan_tier, billing_cycle, price, status, is_enabled, inventory_limit, features_enabled, start_date, end_date)
      SELECT user_id, 'Enterprise Admin Plan', 'enterprise', 'yearly', 0.00, 'active', TRUE, 99999, '["inventory_management", "barcode_scanner", "qr_shelf_tags", "daily_sales_analytics", "admin_portal"]'::jsonb, NOW(), NOW() + INTERVAL '3650 days'
      FROM app_users
      WHERE phone LIKE '%9739765357%' OR email LIKE '%9739765357%'
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO vendors (vendor_name, contact_person, email, phone, address, tax_id, supplied_categories, payment_terms, lead_time_days, status)
      VALUES
        ('Amul Dairy Distribution Ltd', 'Sanjay Patel', 'orders@amuldairy.com', '+91 9825012345', 'Anand GIDC Industrial Area, Gujarat', 'GSTIN24AAACA1234F1Z5', 'Dairy & Eggs', 'Net 15', 1, 'active'),
        ('Bonn Food Specialties', 'Harmit Singh', 'wholesale@bonnbread.com', '+91 9814012345', 'Focal Point, Ludhiana, Punjab', 'GSTIN03AAACB2345G1Z6', 'Bakery & Snacks', 'Net 30', 2, 'active'),
        ('Beverage Hub National', 'Ramesh Rao', 'supply@beveragehub.in', '+91 9880012345', 'Whitefield Logistics Park, Bengaluru', 'GSTIN29AAACC3456H1Z7', 'Beverages', 'Net 21', 2, 'active'),
        ('Himalayan Agro Produce', 'Deepak Joshi', 'farmers@himalayanagro.in', '+91 9412012345', 'Dehradun Mandi Yard, Uttarakhand', 'GSTIN05AAACD4567J1Z8', 'Fresh Produce, Pantry & Staples', 'Cash on Delivery', 3, 'active')
      ON CONFLICT DO NOTHING;
    `);

    console.log('PostgreSQL database and tables initialized successfully: app_users, vendors, store_subscriptions (Admin 9739765357 configured)');
  } catch (err: any) {
    console.error('Error during PostgreSQL table initialization:', err.message);
  }
}

// Subscription and Admin validation helper
function isAuthorizedForInventory(req: express.Request): boolean {
  const role = (req.headers['x-user-role'] as string || '').toLowerCase();
  const email = (req.headers['x-user-email'] as string || '').toLowerCase().trim();
  const phone = (req.headers['x-user-phone'] as string || '').replace(/\D/g, '');
  const uid = (req.headers['x-user-uid'] as string || '').trim();
  const subStatus = (req.headers['x-user-subscription'] as string || '').toLowerCase();

  // Admin user always has full access (including 9739765357)
  if (
    email.includes('9739765357') ||
    phone.includes('9739765357') ||
    uid.includes('9739765357')
  ) {
    return true;
  }

  // Active subscription
  if (subStatus === 'active') {
    return true;
  }

  return false;
}

export async function startServer() {
  await initDatabaseTables();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.warn('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env before accepting payments.');
  }
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // --- API ROUTES FIRST ---

  // Health & DB Connection Status
  app.get('/api/health', async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW() as now, current_database() as db');
      res.json({ 
        status: 'ok', 
        postgres: 'connected', 
        database: result.rows[0].db,
        serverTime: result.rows[0].now 
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', postgres: 'disconnected', error: error.message });
    }
  });

  // Detailed PostgreSQL Status and Counts
  app.get('/api/postgres/status', async (req, res) => {
    try {
      const [prodRes, codeRes, catRes, userRes, vendorRes, subRes] = await Promise.all([
        pool.query('SELECT count(*)::int as count FROM supermarket_products'),
        pool.query('SELECT count(*)::int as count FROM scannable_codes'),
        pool.query('SELECT count(*)::int as count FROM product_categories'),
        pool.query('SELECT count(*)::int as count FROM app_users'),
        pool.query('SELECT count(*)::int as count FROM vendors'),
        pool.query('SELECT count(*)::int as count FROM store_subscriptions')
      ]);

      res.json({
        connected: true,
        host: 'db.prisma.io',
        database: 'postgres',
        counts: {
          products: prodRes.rows[0].count,
          scannableCodes: codeRes.rows[0].count,
          categories: catRes.rows[0].count,
          users: userRes.rows[0].count,
          vendors: vendorRes.rows[0].count,
          subscriptions: subRes.rows[0].count
        }
      });
    } catch (error: any) {
      res.status(500).json({ connected: false, error: error.message });
    }
  });

  // Get all categories
  app.get('/api/categories', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM product_categories ORDER BY category_name ASC');
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all products joined with categories and scannable codes
  app.get('/api/products', async (req, res) => {
    const role = (req.headers['x-user-role'] as string || '').toLowerCase();
    const subStatus = (req.headers['x-user-subscription'] as string || '').toLowerCase();
    const email = (req.headers['x-user-email'] as string || '').toLowerCase().trim();
    const phone = (req.headers['x-user-phone'] as string || '').replace(/\D/g, '');
    const uid = (req.headers['x-user-uid'] as string || '').trim();

    const isAdminUser = 
      email.includes('9739765357') ||
      phone.includes('9739765357') ||
      uid.includes('9739765357');

    // If client supplied user role / context and is not admin or subscribed, restrict inventory
    if (role === 'store_owner' && subStatus !== 'active' && !isAdminUser) {
      return res.status(403).json({
        error: 'Active subscription required. Store owner cannot view or manage items from database until subscribed.',
        subscriptionRequired: true
      });
    }

    try {
      const queryText = `
        SELECT 
          p.product_id AS id,
          p.product_id,
          p.product_name AS name,
          p.product_name,
          p.brand_name AS brand,
          p.brand_name,
          p.retail_price::numeric::float8 AS price,
          p.retail_price,
          p.stock_quantity::int AS stock,
          p.stock_quantity,
          p.product_description AS description,
          p.product_description,
          p.image_url,
          p.category_id,
          COALESCE(c.category_name, 'General') AS category,
          COALESCE(c.category_name, 'General') AS category_name,
          COALESCE(sc.code_payload, '') AS "qrCode",
          COALESCE(sc.code_payload, '') AS barcode,
          COALESCE(sc.code_payload, '') AS code_payload,
          COALESCE(sc.code_type, 'QR_CODE') AS "codeType",
          COALESCE(sc.code_type, 'QR_CODE') AS code_type,
          p.created_at,
          p.updated_at
        FROM supermarket_products p
        LEFT JOIN product_categories c ON p.category_id = c.category_id
        LEFT JOIN (
          SELECT DISTINCT ON (product_id) product_id, code_payload, code_type 
          FROM scannable_codes 
          WHERE is_active = TRUE OR is_active IS NULL 
          ORDER BY product_id, code_id DESC
        ) sc ON p.product_id = sc.product_id
        ORDER BY p.product_id DESC;
      `;

      const result = await pool.query(queryText);
      res.json(result.rows);
    } catch (error: any) {
      console.error('Error fetching products from PostgreSQL:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Instant B-Tree Scannable Code Lookup (used by Scanner & Customer scanning app)
  app.get('/api/scannable-codes/lookup/:code', async (req, res) => {
    const { code } = req.params;
    try {
      const queryText = `
        SELECT 
          p.product_id AS id,
          p.product_name AS name,
          p.brand_name AS brand,
          p.retail_price::numeric::float8 AS price,
          p.stock_quantity::int AS stock,
          p.product_description AS description,
          p.image_url,
          COALESCE(c.category_name, 'General') AS category,
          sc.code_payload AS "qrCode",
          sc.code_payload AS barcode,
          sc.code_type AS "codeType"
        FROM scannable_codes sc
        JOIN supermarket_products p ON sc.product_id = p.product_id
        LEFT JOIN product_categories c ON p.category_id = c.category_id
        WHERE sc.code_payload = $1 AND (sc.is_active = TRUE OR sc.is_active IS NULL)
        LIMIT 1;
      `;
      const result = await pool.query(queryText, [code]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found for code: ' + code });
      }
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create single product in PostgreSQL
  app.post('/api/products', async (req, res) => {
    if (!isAuthorizedForInventory(req)) {
      return res.status(403).json({
        error: 'Active subscription required. Store owner must subscribe before adding products to database.',
        subscriptionRequired: true
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name,
        brand = '',
        price = 0,
        stock = 0,
        description = '',
        category = 'General',
        qrCode = '',
        barcode = '',
        codeType = 'QR_CODE',
        image_url = ''
      } = req.body;

      if (!name || !name.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Product name is required' });
      }

      // 0. Duplicate Barcode / Code Check
      const primaryCode = (barcode && barcode.trim()) || (qrCode && qrCode.trim());
      if (primaryCode) {
        const existingCodeRes = await client.query(
          `SELECT sc.product_id, p.product_name, p.brand_name 
           FROM scannable_codes sc
           JOIN supermarket_products p ON sc.product_id = p.product_id
           WHERE LOWER(sc.code_payload) = LOWER($1) AND (sc.is_active = TRUE OR sc.is_active IS NULL)
           LIMIT 1`,
          [primaryCode]
        );
        if (existingCodeRes.rows.length > 0) {
          await client.query('ROLLBACK');
          const dup = existingCodeRes.rows[0];
          return res.status(409).json({
            error: `Duplicate Code: Item "${dup.product_name}" is already registered with code "${primaryCode}".`,
            duplicateProductId: dup.product_id,
            duplicateProductName: dup.product_name
          });
        }
      }

      // Check duplicate product name within same brand
      const existingNameRes = await client.query(
        `SELECT product_id, product_name FROM supermarket_products 
         WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1)) 
           AND ($2 = '' OR LOWER(TRIM(COALESCE(brand_name, ''))) = LOWER(TRIM($2)))
         LIMIT 1`,
        [name.trim(), (brand || '').trim()]
      );
      if (existingNameRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Duplicate Item: A product with name "${name.trim()}" already exists in your inventory.`,
          duplicateProductId: existingNameRes.rows[0].product_id
        });
      }

      // 1. Find or create category
      let categoryId: number | null = null;
      if (category && category.trim()) {
        const catRes = await client.query(
          'SELECT category_id FROM product_categories WHERE LOWER(category_name) = LOWER($1)',
          [category.trim()]
        );
        if (catRes.rows.length > 0) {
          categoryId = catRes.rows[0].category_id;
        } else {
          const insertCat = await client.query(
            'INSERT INTO product_categories (category_name) VALUES ($1) RETURNING category_id',
            [category.trim()]
          );
          categoryId = insertCat.rows[0].category_id;
        }
      }

      // 2. Insert into supermarket_products
      const insertProd = await client.query(
        `INSERT INTO supermarket_products 
          (category_id, product_name, brand_name, retail_price, stock_quantity, product_description, image_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [
          categoryId,
          name.trim(),
          brand ? brand.trim() : null,
          parseFloat(price) || 0,
          parseInt(stock) || 0,
          description ? description.trim() : null,
          image_url ? image_url.trim() : null
        ]
      );
      const newProduct = insertProd.rows[0];

      // 3. Insert into scannable_codes (handle both barcode and QR code if different)
      const finalBarcode = (barcode && barcode.trim()) ? barcode.trim() : '';
      const finalQr = (qrCode && qrCode.trim()) ? qrCode.trim() : '';
      const finalCode = finalBarcode || finalQr || `ITEM-${name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Insert primary code
      await client.query(
        `INSERT INTO scannable_codes (product_id, code_payload, code_type, is_active, created_at)
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (code_payload) DO UPDATE SET is_active = true`,
        [newProduct.product_id, finalCode, codeType]
      );

      // If both barcode and qrCode were provided and are distinct, index both!
      if (finalQr && finalBarcode && finalQr !== finalBarcode) {
        await client.query(
          `INSERT INTO scannable_codes (product_id, code_payload, code_type, is_active, created_at)
           VALUES ($1, $2, 'QR_CODE', true, NOW())
           ON CONFLICT (code_payload) DO UPDATE SET is_active = true`,
          [newProduct.product_id, finalQr]
        );
      }

      await client.query('COMMIT');

      // Return fully formed product object
      res.status(201).json({
        id: newProduct.product_id,
        product_id: newProduct.product_id,
        name: newProduct.product_name,
        product_name: newProduct.product_name,
        brand: newProduct.brand_name || '',
        price: parseFloat(newProduct.retail_price),
        stock: newProduct.stock_quantity,
        description: newProduct.product_description || '',
        category: category.trim(),
        qrCode: finalQr || finalCode,
        barcode: finalBarcode || finalCode,
        codeType: codeType,
        created_at: newProduct.created_at
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error adding product to PostgreSQL:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  // Update single product in PostgreSQL
  app.put('/api/products/:id', async (req, res) => {
    if (!isAuthorizedForInventory(req)) {
      return res.status(403).json({
        error: 'Active subscription required. Store owner must subscribe before modifying inventory in database.',
        subscriptionRequired: true
      });
    }
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name,
        brand = '',
        price = 0,
        stock = 0,
        description = '',
        category = 'General',
        qrCode = '',
        barcode = '',
        codeType = 'QR_CODE',
        image_url = ''
      } = req.body;

      // Duplicate check for barcode / qrCode on other products
      const primaryCode = (barcode && barcode.trim()) || (qrCode && qrCode.trim());
      if (primaryCode) {
        const dupRes = await client.query(
          `SELECT sc.product_id, p.product_name 
           FROM scannable_codes sc
           JOIN supermarket_products p ON sc.product_id = p.product_id
           WHERE LOWER(sc.code_payload) = LOWER($1) 
             AND sc.product_id != $2 
             AND (sc.is_active = TRUE OR sc.is_active IS NULL)
           LIMIT 1`,
          [primaryCode, id]
        );
        if (dupRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: `Duplicate Code: Another item ("${dupRes.rows[0].product_name}") is already registered with code "${primaryCode}".`
          });
        }
      }

      // Find or insert category
      let categoryId: number | null = null;
      if (category && category.trim()) {
        const catRes = await client.query(
          'SELECT category_id FROM product_categories WHERE LOWER(category_name) = LOWER($1)',
          [category.trim()]
        );
        if (catRes.rows.length > 0) {
          categoryId = catRes.rows[0].category_id;
        } else {
          const insertCat = await client.query(
            'INSERT INTO product_categories (category_name) VALUES ($1) RETURNING category_id',
            [category.trim()]
          );
          categoryId = insertCat.rows[0].category_id;
        }
      }

      // Update supermarket_products
      const updateProd = await client.query(
        `UPDATE supermarket_products 
         SET category_id = $1,
             product_name = $2,
             brand_name = $3,
             retail_price = $4,
             stock_quantity = $5,
             product_description = $6,
             image_url = $7,
             updated_at = NOW()
         WHERE product_id = $8
         RETURNING *`,
        [
          categoryId,
          name.trim(),
          brand ? brand.trim() : null,
          parseFloat(price) || 0,
          parseInt(stock) || 0,
          description ? description.trim() : null,
          image_url ? image_url.trim() : null,
          id
        ]
      );

      if (updateProd.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found' });
      }

      // Update or insert scannable_codes
      if (qrCode && qrCode.trim()) {
        const existingCode = await client.query(
          'SELECT code_id FROM scannable_codes WHERE product_id = $1',
          [id]
        );
        if (existingCode.rows.length > 0) {
          await client.query(
            'UPDATE scannable_codes SET code_payload = $1, code_type = $2, is_active = true WHERE product_id = $3',
            [qrCode.trim(), codeType, id]
          );
        } else {
          await client.query(
            `INSERT INTO scannable_codes (product_id, code_payload, code_type, is_active, created_at)
             VALUES ($1, $2, $3, true, NOW())
             ON CONFLICT (code_payload) DO NOTHING`,
            [id, qrCode.trim(), codeType]
          );
        }
      }

      await client.query('COMMIT');
      res.json({
        id: Number(id),
        name: updateProd.rows[0].product_name,
        brand: updateProd.rows[0].brand_name || '',
        price: parseFloat(updateProd.rows[0].retail_price),
        stock: updateProd.rows[0].stock_quantity,
        category: category.trim(),
        qrCode: qrCode.trim(),
        codeType
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  // Delete product in PostgreSQL
  app.delete('/api/products/:id', async (req, res) => {
    if (!isAuthorizedForInventory(req)) {
      return res.status(403).json({
        error: 'Active subscription required. Store owner must subscribe before deleting inventory items.',
        subscriptionRequired: true
      });
    }
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM scannable_codes WHERE product_id = $1', [id]);
      const del = await client.query('DELETE FROM supermarket_products WHERE product_id = $1 RETURNING product_id', [id]);
      await client.query('COMMIT');

      if (del.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json({ success: true, deletedId: id });
    } catch (error: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  // Update Stock quantity (e.g. quick adjustments or scan decrements)
  app.patch('/api/products/:id/stock', async (req, res) => {
    if (!isAuthorizedForInventory(req)) {
      return res.status(403).json({
        error: 'Active subscription required to adjust stock.',
        subscriptionRequired: true
      });
    }
    const { id } = req.params;
    const { stock } = req.body;
    try {
      const updateRes = await pool.query(
        'UPDATE supermarket_products SET stock_quantity = $1, updated_at = NOW() WHERE product_id = $2 RETURNING product_id, stock_quantity',
        [parseInt(stock) || 0, id]
      );
      if (updateRes.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json({ success: true, id, stock: updateRes.rows[0].stock_quantity });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk Import products into PostgreSQL (from CSV Upload)
  app.post('/api/products/bulk', async (req, res) => {
    if (!isAuthorizedForInventory(req)) {
      return res.status(403).json({
        error: 'Active subscription required. Store owner must subscribe before importing items.',
        subscriptionRequired: true
      });
    }
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Expected non-empty items array' });
    }

    const client = await pool.connect();
    let insertedCount = 0;
    const errors: string[] = [];

    try {
      await client.query('BEGIN');

      // Pre-fetch category cache
      const catRows = await client.query('SELECT category_id, LOWER(category_name) as cat_name FROM product_categories');
      const categoryMap = new Map<string, number>();
      catRows.rows.forEach(r => categoryMap.set(r.cat_name, r.category_id));

      for (const item of items) {
        try {
          const rawName = (item.name || item.product_name || '').trim();
          if (!rawName) continue;

          const rawCat = (item.category || item.category_name || 'General').trim();
          const catKey = rawCat.toLowerCase();
          let categoryId = categoryMap.get(catKey);

          if (!categoryId) {
            const newCat = await client.query(
              'INSERT INTO product_categories (category_name) VALUES ($1) ON CONFLICT (category_name) DO UPDATE SET category_name = EXCLUDED.category_name RETURNING category_id',
              [rawCat]
            );
            categoryId = newCat.rows[0].category_id;
            categoryMap.set(catKey, categoryId);
          }

          const priceVal = parseFloat(item.price ?? item.retail_price) || 0;
          const stockVal = parseInt(item.stock ?? item.stock_quantity) || 0;
          const brandVal = (item.brand || item.brand_name || '').trim() || null;
          const descVal = (item.description || item.product_description || '').trim() || null;
          const imgVal = (item.imageUrl || item.image_url || '').trim() || null;

          const prodInsert = await client.query(
            `INSERT INTO supermarket_products 
              (category_id, product_name, brand_name, retail_price, stock_quantity, product_description, image_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             RETURNING product_id`,
            [categoryId, rawName, brandVal, priceVal, stockVal, descVal, imgVal]
          );
          const newId = prodInsert.rows[0].product_id;

          const rawCode = (item.qrCode || item.code_payload || item.barcode || '').trim();
          const finalCode = rawCode || `ITEM-${rawName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const codeType = item.codeType || item.code_type || 'QR_CODE';

          await client.query(
            `INSERT INTO scannable_codes (product_id, code_payload, code_type, is_active, created_at)
             VALUES ($1, $2, $3, true, NOW())
             ON CONFLICT (code_payload) DO NOTHING`,
            [newId, finalCode, codeType]
          );

          insertedCount++;
        } catch (itemErr: any) {
          errors.push(`Row error (${item.name || 'unknown'}): ${itemErr.message}`);
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, count: insertedCount, errors });
    } catch (bulkError: any) {
      await client.query('ROLLBACK');
      console.error('Bulk import transaction failed:', bulkError);
      res.status(500).json({ error: bulkError.message });
    } finally {
      client.release();
    }
  });

  // ============================================================================
  // USER MANAGEMENT API
  // ============================================================================
  app.get('/api/users', async (req, res) => {
    try {
      const queryText = `
        SELECT 
          u.user_id,
          u.firebase_uid,
          u.email,
          u.full_name,
          u.role,
          u.phone,
          u.store_name,
          u.is_active,
          u.created_at,
          u.updated_at,
          s.subscription_id,
          s.plan_name,
          s.plan_tier,
          s.price as subscription_price,
          s.status as subscription_status,
          s.is_enabled as subscription_enabled,
          s.end_date as subscription_end_date
        FROM app_users u
        LEFT JOIN (
          SELECT DISTINCT ON (user_id) * FROM store_subscriptions ORDER BY user_id, subscription_id DESC
        ) s ON u.user_id = s.user_id
        ORDER BY u.user_id ASC;
      `;
      const result = await pool.query(queryText);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/users', async (req, res) => {
    const { email, full_name = '', role = 'store_owner', phone = '', store_name = '', firebase_uid = null } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });

    try {
      const result = await pool.query(
        `INSERT INTO app_users (email, full_name, role, phone, store_name, firebase_uid, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE 
         SET full_name = EXCLUDED.full_name,
             role = EXCLUDED.role,
             phone = EXCLUDED.phone,
             store_name = EXCLUDED.store_name,
             updated_at = NOW()
         RETURNING *`,
        [email.toLowerCase().trim(), full_name.trim(), role, phone.trim(), store_name.trim(), firebase_uid]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { role, is_active, full_name, phone, store_name } = req.body;
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
      if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
      if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
      if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
      if (store_name !== undefined) { fields.push(`store_name = $${idx++}`); values.push(store_name); }

      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const queryText = `UPDATE app_users SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING *`;
      const result = await pool.query(queryText, values);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // VENDOR MANAGEMENT API
  // ============================================================================
  app.get('/api/vendors', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM vendors ORDER BY vendor_id ASC');
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/vendors', async (req, res) => {
    const {
      vendor_name,
      contact_person = '',
      email = '',
      phone = '',
      address = '',
      tax_id = '',
      supplied_categories = '',
      payment_terms = 'Net 30',
      lead_time_days = 3,
      status = 'active'
    } = req.body;

    if (!vendor_name || !vendor_name.trim()) {
      return res.status(400).json({ error: 'Vendor name is required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO vendors 
          (vendor_name, contact_person, email, phone, address, tax_id, supplied_categories, payment_terms, lead_time_days, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [vendor_name.trim(), contact_person.trim(), email.trim(), phone.trim(), address.trim(), tax_id.trim(), supplied_categories.trim(), payment_terms, lead_time_days, status]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/vendors/:id', async (req, res) => {
    const { id } = req.params;
    const {
      vendor_name,
      contact_person = '',
      email = '',
      phone = '',
      address = '',
      tax_id = '',
      supplied_categories = '',
      payment_terms = 'Net 30',
      lead_time_days = 3,
      status = 'active'
    } = req.body;

    try {
      const result = await pool.query(
        `UPDATE vendors SET 
          vendor_name = $1, contact_person = $2, email = $3, phone = $4, address = $5,
          tax_id = $6, supplied_categories = $7, payment_terms = $8, lead_time_days = $9, status = $10, updated_at = NOW()
         WHERE vendor_id = $11 RETURNING *`,
        [vendor_name, contact_person, email, phone, address, tax_id, supplied_categories, payment_terms, lead_time_days, status, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/vendors/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query('DELETE FROM vendors WHERE vendor_id = $1 RETURNING vendor_id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
      res.json({ success: true, deletedId: id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // SUBSCRIPTION ENABLED MANAGEMENT API
  // ============================================================================
  app.get('/api/subscriptions', async (req, res) => {
    try {
      const queryText = `
        SELECT 
          s.*,
          u.email as user_email,
          u.full_name as user_name,
          u.store_name,
          u.role as user_role
        FROM store_subscriptions s
        LEFT JOIN app_users u ON s.user_id = u.user_id
        ORDER BY s.subscription_id DESC;
      `;
      const result = await pool.query(queryText);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/subscriptions', async (req, res) => {
    const {
      user_id,
      firebase_uid,
      plan_name,
      plan_tier = 'basic',
      billing_cycle = 'monthly',
      price = 2499,
      status = 'active',
      is_enabled = true,
      inventory_limit = 500,
      features_enabled = ["inventory_management", "barcode_scanner", "qr_shelf_tags", "daily_sales_analytics"],
      days = 30,
      payment_reference = ''
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO store_subscriptions
          (user_id, firebase_uid, plan_name, plan_tier, billing_cycle, price, status, is_enabled, inventory_limit, features_enabled, start_date, end_date, last_payment_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW() + ($11 || ' days')::INTERVAL, $12, NOW(), NOW())
         RETURNING *`,
        [user_id || null, firebase_uid || null, plan_name, plan_tier, billing_cycle, price, status, is_enabled, inventory_limit, JSON.stringify(features_enabled), String(days), payment_reference]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/subscriptions/:id', async (req, res) => {
    const { id } = req.params;
    const { is_enabled, status, plan_tier, plan_name, price, inventory_limit, extend_days } = req.body;

    try {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (is_enabled !== undefined) { fields.push(`is_enabled = $${idx++}`); values.push(is_enabled); }
      if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
      if (plan_tier !== undefined) { fields.push(`plan_tier = $${idx++}`); values.push(plan_tier); }
      if (plan_name !== undefined) { fields.push(`plan_name = $${idx++}`); values.push(plan_name); }
      if (price !== undefined) { fields.push(`price = $${idx++}`); values.push(price); }
      if (inventory_limit !== undefined) { fields.push(`inventory_limit = $${idx++}`); values.push(inventory_limit); }

      if (extend_days) {
        fields.push(`end_date = end_date + ($${idx++} || ' days')::INTERVAL`);
        values.push(String(extend_days));
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const queryText = `UPDATE store_subscriptions SET ${fields.join(', ')} WHERE subscription_id = $${idx} RETURNING *`;
      const result = await pool.query(queryText, values);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Subscription not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // RAZORPAY CHECKOUT API
  // ============================================================================
  app.post('/api/payments/razorpay/order', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-StoreOwner-Pricing-Version', '2026-09-09-100-200');
    const { planId } = req.body;
    const plan = subscriptionPlans[planId as keyof typeof subscriptionPlans];
    if (!plan) return res.status(400).json({ error: 'Invalid subscription plan' });
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Razorpay is not configured on the server' });
    }

    try {
      const result = await pool.query(
        'SELECT user_id, firebase_uid, email FROM app_users WHERE firebase_uid = $1 OR email = $2 LIMIT 1',
        [req.headers['x-user-uid'] || null, String(req.headers['x-user-email'] || '').toLowerCase()]
      );
      if (result.rows.length === 0) return res.status(401).json({ error: 'Authenticated user not found' });

      const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: plan.price * 100,
          currency: 'INR',
          receipt: `sub_${result.rows[0].user_id}_${Date.now()}`,
          notes: { plan_id: planId, user_id: String(result.rows[0].user_id) }
        })
      });
      if (!orderResponse.ok) {
        const error = await orderResponse.json().catch(() => ({}));
        return res.status(502).json({ error: error.error?.description || 'Unable to create Razorpay order' });
      }

      res.json({ keyId: RAZORPAY_KEY_ID, plan, order: await orderResponse.json() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/payments/razorpay/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;
    const plan = subscriptionPlans[planId as keyof typeof subscriptionPlans];
    if (!plan || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Incomplete payment details' });
    }
    if (!RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Razorpay is not configured on the server' });

    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    try {
      const userResult = await pool.query(
        'SELECT user_id, firebase_uid FROM app_users WHERE firebase_uid = $1 OR email = $2 LIMIT 1',
        [req.headers['x-user-uid'] || null, String(req.headers['x-user-email'] || '').toLowerCase()]
      );
      if (userResult.rows.length === 0) return res.status(401).json({ error: 'Authenticated user not found' });

      const user = userResult.rows[0];
      const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`
        }
      });
      if (!orderResponse.ok) return res.status(400).json({ error: 'Unable to validate Razorpay order' });
      const order = await orderResponse.json();
      if (
        order.amount !== plan.price * 100 ||
        String(order.notes?.user_id || '') !== String(user.user_id) ||
        order.notes?.plan_id !== planId
      ) {
        return res.status(400).json({ error: 'Razorpay order does not match this subscription' });
      }

      const subscriptionResult = await pool.query(
        `INSERT INTO store_subscriptions
          (user_id, firebase_uid, plan_name, plan_tier, billing_cycle, price, status, is_enabled, inventory_limit, features_enabled, start_date, end_date, last_payment_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'monthly', $5, 'active', TRUE, $6,
           '["inventory_management", "barcode_scanner", "qr_shelf_tags", "daily_sales_analytics"]'::jsonb,
           NOW(), NOW() + INTERVAL '30 days', $7, NOW(), NOW())
         RETURNING *`,
        [user.user_id, user.firebase_uid, plan.name, planId, plan.price, plan.inventoryLimit, razorpay_payment_id]
      );
      res.json({ success: true, subscription: subscriptionResult.rows[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // POSTGRESQL AUTHENTICATION API
  // ============================================================================
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, full_name = '', phone = '', store_name = '' } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email and a password of at least 6 characters are required' });
    }

    try {
      const existing = await pool.query('SELECT user_id FROM app_users WHERE email = $1 LIMIT 1', [String(email).toLowerCase().trim()]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this mobile number already exists' });

      const result = await pool.query(
        `INSERT INTO app_users (firebase_uid, email, full_name, role, phone, store_name, password_hash, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'store_owner', $4, $5, $6, TRUE, NOW(), NOW()) RETURNING *`,
        [`pg_${crypto.randomUUID()}`, String(email).toLowerCase().trim(), full_name, phone, store_name, hashPassword(password)]
      );
      const user = result.rows[0];
      const token = await createSession(user.user_id);
      setSessionCookie(res, token);
      res.status(201).json({ user, role: user.role, isAdmin: false, isSubscribed: false, subscription: null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    try {
      const result = await pool.query('SELECT * FROM app_users WHERE email = $1 LIMIT 1', [String(email).toLowerCase().trim()]);
      const user = result.rows[0];
      if (!user || !user.password_hash || !verifyPassword(password, user.password_hash) || !user.is_active) {
        return res.status(401).json({ error: 'Invalid mobile number or password' });
      }

      const token = await createSession(user.user_id);
      setSessionCookie(res, token);
      const subscriptionResult = await pool.query(
        `SELECT * FROM store_subscriptions WHERE user_id = $1 ORDER BY subscription_id DESC LIMIT 1`,
        [user.user_id]
      );
      const subscription = subscriptionResult.rows[0] || null;
      const isAdmin = String(user.phone || '').replace(/\D/g, '').includes('9739765357') || String(user.email).includes('9739765357');
      res.json({
        user,
        role: isAdmin ? 'admin' : 'store_owner',
        isAdmin,
        isSubscribed: isAdmin || Boolean(subscription && subscription.status === 'active' && subscription.is_enabled && (!subscription.end_date || new Date(subscription.end_date).getTime() > Date.now())),
        subscription
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/session', async (req, res) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const subResult = await pool.query('SELECT * FROM store_subscriptions WHERE user_id = $1 ORDER BY subscription_id DESC LIMIT 1', [user.user_id]);
      const subscription = subResult.rows[0] || null;
      const isAdmin = String(user.phone || '').replace(/\D/g, '').includes('9739765357') || String(user.email).includes('9739765357');
      res.json({
        user,
        role: isAdmin ? 'admin' : 'store_owner',
        isAdmin,
        isSubscribed: isAdmin || Boolean(subscription && subscription.status === 'active' && subscription.is_enabled && (!subscription.end_date || new Date(subscription.end_date).getTime() > Date.now())),
        subscription
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = getSessionToken(req);
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
    }
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ success: true });
  });

  // User auth sync & role verification endpoint
  app.post('/api/auth/sync', async (req, res) => {
    const { firebase_uid, email, full_name, store_name, phone } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
      const lowerEmail = email.toLowerCase().trim();
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const isAdminUser = 
        lowerEmail.includes('9739765357') ||
        cleanPhone.includes('9739765357') ||
        (firebase_uid && String(firebase_uid).includes('9739765357')) ||
        (full_name && String(full_name).includes('9739765357'));

      // 1. Get or create user
      let userQuery = await pool.query('SELECT * FROM app_users WHERE email = $1', [lowerEmail]);
      let user = userQuery.rows[0];

      if (!user) {
        const insertRes = await pool.query(
          `INSERT INTO app_users (firebase_uid, email, full_name, role, phone, store_name, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
           RETURNING *`,
          [firebase_uid || null, lowerEmail, full_name || '', isAdminUser ? 'admin' : 'store_owner', phone || '', store_name || '']
        );
        user = insertRes.rows[0];
      } else {
        // If user is configured admin or matches 9739765357, guarantee admin role
        if (isAdminUser && user.role !== 'admin') {
          const updateAdmin = await pool.query('UPDATE app_users SET role = $1, is_active = TRUE WHERE user_id = $2 RETURNING *', ['admin', user.user_id]);
          user = updateAdmin.rows[0];
        }
      }

      // 2. Fetch subscription status
      const subRes = await pool.query(
        `SELECT * FROM store_subscriptions 
         WHERE (user_id = $1 OR firebase_uid = $2)
         ORDER BY subscription_id DESC LIMIT 1`,
        [user.user_id, firebase_uid]
      );
      const subscription = subRes.rows[0] || null;
      const isAdmin = isAdminUser;
      const resolvedRole = isAdmin ? 'admin' : (user.role === 'admin' ? 'store_owner' : user.role);
      const isSubscribed = isAdmin || (
        subscription &&
        subscription.status === 'active' &&
        subscription.is_enabled === true &&
        (!subscription.end_date || new Date(subscription.end_date).getTime() > Date.now())
      );

      res.json({
        user,
        role: resolvedRole,
        isAdmin,
        isSubscribed: Boolean(isSubscribed),
        subscription
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Express server running on http://0.0.0.0:${PORT} connected to PostgreSQL (Vercel/Prisma)`);
    });
  }
  return app;
}

if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
  });
}
