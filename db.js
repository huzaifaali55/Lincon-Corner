/* ==================================================
   db.js — Supabase Postgres Connection
   ================================================== */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL missing! Supabase connection string set karein.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000
});

async function initDb() {
  console.log('🔄 Database initialize ho raha hai...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS districts (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'district_admin',
      district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS corners (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      district_id INTEGER REFERENCES districts(id) ON DELETE CASCADE,
      location TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      specialty TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      item_number TEXT,
      sub_item_number TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY,
      corner_id INTEGER REFERENCES corners(id) ON DELETE SET NULL,
      corner_name_raw TEXT,
      district_name_raw TEXT,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      item_name_raw TEXT,
      item_number_raw TEXT,
      sub_item_number_raw TEXT,
      description TEXT,
      priority TEXT DEFAULT 'Normal',
      reported_by TEXT,
      contact TEXT,
      photo_url TEXT,
      status TEXT DEFAULT 'Pending',
      assigned_vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      repair_cost NUMERIC DEFAULT 0,
      admin_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS procurements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      item_description TEXT,
      quantity INTEGER DEFAULT 1,
      requested_by TEXT,
      district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'Open',
      selected_quotation_id INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id SERIAL PRIMARY KEY,
      procurement_id INTEGER NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      vendor_name_raw TEXT,
      price NUMERIC DEFAULT 0,
      delivery_days INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_corner ON complaints(corner_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_corners_district ON corners(district_id);
    CREATE INDEX IF NOT EXISTS idx_quotations_proc ON quotations(procurement_id);
  `);

  // Default super admin — Render env se aayega
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@lincoln.pk';
  const adminPass  = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rows.length === 0) {
    const hash = bcrypt.hashSync(adminPass, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
      [adminEmail, hash, 'Super Admin', 'super_admin']
    );
    console.log('✅ Default admin created:', adminEmail);
  }

  console.log('✅ Database ready!');
}

module.exports = { pool, initDb };