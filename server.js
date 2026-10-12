/* ==================================================
   server.js — Lincoln Corners Backend (WhatsApp version)
   ================================================== */
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { pool, initDb } = require('./db');
const { sendComplaintWhatsApp } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-please';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'my-webhook-secret-123';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Helpers ---------- */
function sign(u) {
  return jwt.sign(
    { id: u.id, email: u.email, role: u.role, district_id: u.district_id },
    JWT_SECRET, { expiresIn: '30d' }
  );
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}
function superOnly(req, res, next) {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  next();
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Login / Me ---------- */
app.post('/api/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const u = r.rows[0];
  if (!u || !bcrypt.compareSync(password, u.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name, role: u.role, district_id: u.district_id } });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const r = await pool.query('SELECT id, email, name, role, district_id FROM users WHERE id = $1', [req.user.id]);
  res.json(r.rows[0]);
}));

/* ---------- Users ---------- */
app.get('/api/users', auth, superOnly, wrap(async (req, res) => {
  const r = await pool.query('SELECT id, email, name, role, district_id, created_at FROM users ORDER BY id DESC');
  res.json(r.rows);
}));
app.post('/api/users', auth, superOnly, wrap(async (req, res) => {
  const { email, password, name, role, district_id } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const hash = bcrypt.hashSync(password, 10);
  const r = await pool.query(
    'INSERT INTO users (email, password_hash, name, role, district_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [email, hash, name || '', role || 'district_admin', district_id || null]
  );
  res.json({ id: r.rows[0].id });
}));
app.delete('/api/users/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query("DELETE FROM users WHERE id = $1 AND role != 'super_admin'", [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Districts ---------- */
app.get('/api/districts', auth, wrap(async (req, res) => {
  const r = await pool.query('SELECT * FROM districts ORDER BY name');
  res.json(r.rows);
}));
app.post('/api/districts', auth, superOnly, wrap(async (req, res) => {
  try {
    const r = await pool.query('INSERT INTO districts (name) VALUES ($1) RETURNING id', [req.body.name]);
    res.json({ id: r.rows[0].id });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.put('/api/districts/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('UPDATE districts SET name = $1 WHERE id = $2', [req.body.name, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/districts/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM districts WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Corners ---------- */
app.get('/api/corners', auth, wrap(async (req, res) => {
  const sql = `SELECT c.*, d.name AS district_name
    FROM corners c LEFT JOIN districts d ON d.id = c.district_id
    ${req.user.role === 'super_admin' ? '' : 'WHERE c.district_id = $1'}
    ORDER BY d.name, c.name`;
  const r = req.user.role === 'super_admin'
    ? await pool.query(sql)
    : await pool.query(sql, [req.user.district_id]);
  res.json(r.rows);
}));
app.post('/api/corners', auth, wrap(async (req, res) => {
  const { name, district_id, location } = req.body;
  if (!name || !district_id) return res.status(400).json({ error: 'Name & district required' });
  if (req.user.role !== 'super_admin' && Number(district_id) !== req.user.district_id)
    return res.status(403).json({ error: 'Not allowed for this district' });
  const r = await pool.query(
    'INSERT INTO corners (name, district_id, location) VALUES ($1,$2,$3) RETURNING id',
    [name, district_id, location || '']
  );
  res.json({ id: r.rows[0].id });
}));
app.put('/api/corners/:id', auth, wrap(async (req, res) => {
  const { name, district_id, location } = req.body;
  if (req.user.role !== 'super_admin' && Number(district_id) !== req.user.district_id)
    return res.status(403).json({ error: 'Not allowed' });
  await pool.query('UPDATE corners SET name=$1, district_id=$2, location=$3 WHERE id=$4',
    [name, district_id, location || '', req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/corners/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM corners WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Vendors ---------- */
app.get('/api/vendors', auth, wrap(async (req, res) => {
  const r = await pool.query('SELECT * FROM vendors ORDER BY name');
  res.json(r.rows);
}));
app.post('/api/vendors', auth, wrap(async (req, res) => {
  const { name, contact_person, phone, email, address, specialty, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = await pool.query(
    `INSERT INTO vendors (name, contact_person, phone, email, address, specialty, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [name, contact_person || '', phone || '', email || '', address || '', specialty || '', notes || '']
  );
  res.json({ id: r.rows[0].id });
}));
app.put('/api/vendors/:id', auth, wrap(async (req, res) => {
  const { name, contact_person, phone, email, address, specialty, notes } = req.body;
  await pool.query(
    `UPDATE vendors SET name=$1, contact_person=$2, phone=$3, email=$4, address=$5, specialty=$6, notes=$7 WHERE id=$8`,
    [name, contact_person || '', phone || '', email || '', address || '', specialty || '', notes || '', req.params.id]
  );
  res.json({ ok: true });
}));
app.delete('/api/vendors/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM vendors WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Items ---------- */
app.get('/api/items', auth, wrap(async (req, res) => {
  const r = await pool.query('SELECT * FROM items ORDER BY name');
  res.json(r.rows);
}));
app.post('/api/items', auth, wrap(async (req, res) => {
  const { name, item_number, sub_item_number, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = await pool.query(
    'INSERT INTO items (name, item_number, sub_item_number, description) VALUES ($1,$2,$3,$4) RETURNING id',
    [name, item_number || '', sub_item_number || '', description || '']
  );
  res.json({ id: r.rows[0].id });
}));
app.put('/api/items/:id', auth, wrap(async (req, res) => {
  const { name, item_number, sub_item_number, description } = req.body;
  await pool.query(
    'UPDATE items SET name=$1, item_number=$2, sub_item_number=$3, description=$4 WHERE id=$5',
    [name, item_number || '', sub_item_number || '', description || '', req.params.id]
  );
  res.json({ ok: true });
}));
app.delete('/api/items/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Complaints ---------- */
app.get('/api/complaints', auth, wrap(async (req, res) => {
  const { district_id, corner_id, status, from, to, search } = req.query;
  let sql = `SELECT cm.*, c.name AS corner_name, d.name AS district_name, v.name AS vendor_name
    FROM complaints cm
    LEFT JOIN corners c ON c.id = cm.corner_id
    LEFT JOIN districts d ON d.id = c.district_id
    LEFT JOIN vendors v ON v.id = cm.assigned_vendor_id
    WHERE 1=1`;
  const p = [];
  let i = 1;
  if (req.user.role !== 'super_admin') { sql += ` AND c.district_id = $${i++}`; p.push(req.user.district_id); }
  else if (district_id) { sql += ` AND c.district_id = $${i++}`; p.push(district_id); }
  if (corner_id) { sql += ` AND cm.corner_id = $${i++}`; p.push(corner_id); }
  if (status) { sql += ` AND cm.status = $${i++}`; p.push(status); }
  if (from) { sql += ` AND cm.created_at >= $${i++}`; p.push(from); }
  if (to) { sql += ` AND cm.created_at <= $${i++}`; p.push(to + ' 23:59:59'); }
  if (search) {
    sql += ` AND (cm.description ILIKE $${i} OR cm.item_name_raw ILIKE $${i} OR cm.reported_by ILIKE $${i} OR cm.corner_name_raw ILIKE $${i})`;
    p.push('%' + search + '%');
    i++;
  }
  sql += ' ORDER BY cm.id DESC LIMIT 5000';
  const r = await pool.query(sql, p);
  res.json(r.rows);
}));

app.patch('/api/complaints/:id', auth, wrap(async (req, res) => {
  const { status, assigned_vendor_id, repair_cost, admin_notes } = req.body;
  await pool.query(
    `UPDATE complaints SET status=$1, assigned_vendor_id=$2, repair_cost=$3, admin_notes=$4, updated_at=NOW()
     WHERE id=$5`,
    [status, assigned_vendor_id || null, repair_cost || 0, admin_notes || '', req.params.id]
  );
  res.json({ ok: true });
}));

app.delete('/api/complaints/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM complaints WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- WEBHOOK from Google Apps Script ---------- */
app.post('/api/webhook/complaint', wrap(async (req, res) => {
  const token = req.headers['x-webhook-token'] || req.query.token;
  if (token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Invalid webhook token' });
  const b = req.body || {};

  // ---- Corner matching (exact + fuzzy) ----
  let cornerId = null;
  if (b.corner) {
    let cr = await pool.query(
      `SELECT c.id FROM corners c WHERE c.name ILIKE $1 LIMIT 1`,
      [b.corner]
    );
    if (cr.rows.length === 0) {
      cr = await pool.query(
        `SELECT c.id FROM corners c WHERE $1 ILIKE '%' || c.name || '%' LIMIT 1`,
        [b.corner]
      );
    }
    if (cr.rows.length) cornerId = cr.rows[0].id;
  }

  // ---- Item matching ----
  let itemId = null;
  if (b.item_number) {
    const ir = await pool.query('SELECT id FROM items WHERE item_number = $1 LIMIT 1', [b.item_number]);
    if (ir.rows.length) itemId = ir.rows[0].id;
  }

  // ---- Insert complaint ----
  const r = await pool.query(
    `INSERT INTO complaints
      (corner_id, corner_name_raw, district_name_raw, item_id, item_name_raw, item_number_raw,
       sub_item_number_raw, description, priority, reported_by, contact, photo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      cornerId, b.corner || '', b.district || '', itemId, b.item || '',
      b.item_number || '', b.sub_item_number || '', b.description || '',
      b.priority || 'Normal', b.reported_by || '', b.contact || '', b.photo_url || ''
    ]
  );
  const complaintId = r.rows[0].id;
  console.log('📥 New complaint from webhook #' + complaintId);

  // ---- WhatsApp notification (fire and forget) ----
  sendComplaintWhatsApp({
    id: complaintId,
    district: b.district,
    corner: b.corner,
    item_name_raw: b.item,
    item_number_raw: b.item_number,
    sub_item_number_raw: b.sub_item_number,
    description: b.description,
    priority: b.priority,
    reported_by: b.reported_by,
    contact: b.contact,
    photo_url: b.photo_url
  }).catch(err => console.error('WhatsApp notify error:', err));

  res.json({ ok: true, id: complaintId });
}));

/* ---------- Procurements ---------- */
app.get('/api/procurements', auth, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT p.*, i.name AS item_name, d.name AS district_name,
      (SELECT COUNT(*) FROM quotations q WHERE q.procurement_id = p.id) AS quotes_count
    FROM procurements p
    LEFT JOIN items i ON i.id = p.item_id
    LEFT JOIN districts d ON d.id = p.district_id
    ORDER BY p.id DESC`);
  const procs = r.rows;
  for (const row of procs) {
    row.quotes_count = Number(row.quotes_count);
    const q = await pool.query(
      `SELECT q.*, v.name AS vendor_name FROM quotations q
       LEFT JOIN vendors v ON v.id = q.vendor_id WHERE q.procurement_id = $1`,
      [row.id]
    );
    row.quotations = q.rows;
  }
  res.json(procs);
}));

app.post('/api/procurements', auth, wrap(async (req, res) => {
  const { title, item_id, item_description, quantity, requested_by, district_id, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const r = await pool.query(
    `INSERT INTO procurements (title, item_id, item_description, quantity, requested_by, district_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [title, item_id || null, item_description || '', quantity || 1, requested_by || '', district_id || null, notes || '']
  );
  res.json({ id: r.rows[0].id });
}));

app.patch('/api/procurements/:id', auth, wrap(async (req, res) => {
  const { status, selected_quotation_id, notes } = req.body;
  await pool.query(
    'UPDATE procurements SET status=$1, selected_quotation_id=$2, notes=$3 WHERE id=$4',
    [status, selected_quotation_id || null, notes || '', req.params.id]
  );
  res.json({ ok: true });
}));

app.delete('/api/procurements/:id', auth, superOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM procurements WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/procurements/:id/quotations', auth, wrap(async (req, res) => {
  const { vendor_id, vendor_name_raw, price, delivery_days, notes } = req.body;
  const count = await pool.query('SELECT COUNT(*) AS c FROM quotations WHERE procurement_id = $1', [req.params.id]);
  if (Number(count.rows[0].c) >= 5) return res.status(400).json({ error: 'Maximum 5 quotations allowed' });
  const r = await pool.query(
    `INSERT INTO quotations (procurement_id, vendor_id, vendor_name_raw, price, delivery_days, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.params.id, vendor_id || null, vendor_name_raw || '', price || 0, delivery_days || 0, notes || '']
  );
  res.json({ id: r.rows[0].id });
}));

app.delete('/api/quotations/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM quotations WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Summary ---------- */
app.get('/api/summary', auth, wrap(async (req, res) => {
  const isSuper = req.user.role === 'super_admin';
  const where = isSuper ? '' : 'WHERE c.district_id = $1';
  const params = isSuper ? [] : [req.user.district_id];

  const t = await pool.query(`
    SELECT COUNT(cm.id) AS total,
      COUNT(CASE WHEN status='Pending' THEN 1 END) AS pending,
      COUNT(CASE WHEN status='In Progress' THEN 1 END) AS in_progress,
      COUNT(CASE WHEN status='Resolved' THEN 1 END) AS resolved,
      COALESCE(SUM(repair_cost),0) AS total_cost
    FROM complaints cm LEFT JOIN corners c ON c.id = cm.corner_id ${where}`, params);

  const byD = await pool.query(`
    SELECT d.name AS district, COUNT(cm.id) AS count
    FROM complaints cm
    LEFT JOIN corners c ON c.id = cm.corner_id
    LEFT JOIN districts d ON d.id = c.district_id
    ${isSuper ? '' : 'WHERE c.district_id = $1'}
    GROUP BY d.name ORDER BY count DESC`, params);

  const topV = await pool.query(`
    SELECT v.name AS vendor, COUNT(cm.id) AS jobs, COALESCE(SUM(cm.repair_cost),0) AS cost
    FROM complaints cm LEFT JOIN vendors v ON v.id = cm.assigned_vendor_id
    WHERE cm.assigned_vendor_id IS NOT NULL
    GROUP BY v.name ORDER BY jobs DESC LIMIT 10`);

  const topI = await pool.query(`
    SELECT COALESCE(cm.item_name_raw, i.name) AS item, COUNT(*) AS count
    FROM complaints cm LEFT JOIN items i ON i.id = cm.item_id
    ${isSuper ? '' : 'LEFT JOIN corners c ON c.id = cm.corner_id WHERE c.district_id = $1'}
    GROUP BY item ORDER BY count DESC LIMIT 10`, params);

  const totals = t.rows[0];
  ['total','pending','in_progress','resolved'].forEach(k => totals[k] = Number(totals[k] || 0));
  totals.total_cost = Number(totals.total_cost || 0);

  res.json({
    totals,
    byDistrict: byD.rows.map(r => ({ ...r, count: Number(r.count) })),
    topVendors: topV.rows.map(r => ({ ...r, jobs: Number(r.jobs), cost: Number(r.cost) })),
    topItems: topI.rows.map(r => ({ ...r, count: Number(r.count) }))
  });
}));

/* ---------- CSV Reports ---------- */
app.get('/api/reports/complaints.csv', auth, wrap(async (req, res) => {
  const { district_id, corner_id, from, to, status } = req.query;
  let sql = `SELECT cm.id, d.name AS district, c.name AS corner, cm.item_name_raw AS item,
    cm.item_number_raw AS item_number, cm.sub_item_number_raw AS sub_item_number,
    cm.description, cm.priority, cm.reported_by, cm.status, v.name AS vendor,
    cm.repair_cost, cm.admin_notes, cm.created_at, cm.updated_at
    FROM complaints cm
    LEFT JOIN corners c ON c.id = cm.corner_id
    LEFT JOIN districts d ON d.id = c.district_id
    LEFT JOIN vendors v ON v.id = cm.assigned_vendor_id
    WHERE 1=1`;
  const p = [];
  let i = 1;
  if (req.user.role !== 'super_admin') { sql += ` AND c.district_id = $${i++}`; p.push(req.user.district_id); }
  else if (district_id) { sql += ` AND c.district_id = $${i++}`; p.push(district_id); }
  if (corner_id) { sql += ` AND cm.corner_id = $${i++}`; p.push(corner_id); }
  if (status) { sql += ` AND cm.status = $${i++}`; p.push(status); }
  if (from) { sql += ` AND cm.created_at >= $${i++}`; p.push(from); }
  if (to) { sql += ` AND cm.created_at <= $${i++}`; p.push(to + ' 23:59:59'); }
  sql += ' ORDER BY cm.id DESC';

  const r = await pool.query(sql, p);
  const headers = ['ID','District','Corner','Item','Item #','Sub Item #','Description','Priority','Reported By','Status','Vendor','Repair Cost','Admin Notes','Created','Updated'];
  const csv = [headers.join(',')].concat(r.rows.map(row => [
    row.id, row.district, row.corner, row.item, row.item_number, row.sub_item_number,
    row.description, row.priority, row.reported_by, row.status, row.vendor, row.repair_cost,
    row.admin_notes, row.created_at, row.updated_at
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="complaints-report.csv"');
  res.send('\uFEFF' + csv);
}));

/* ---------- Health check ---------- */
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ---------- Global error handler ---------- */
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

/* ---------- Start ---------- */
initDb().then(() => {
  app.listen(PORT, () => console.log('🚀 Server running on port ' + PORT));
}).catch(err => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});