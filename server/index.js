require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// ── root route ────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ message: 'ShopAccount API Server is running', status: 'OK', endpoints: ['/api/purchases', '/api/sales'] });
});

// ── database connection ───────────────────────────────────────────────────────
// Settings come from .env (local) or the Render environment (online).
// Online MySQL (Aiven) needs DB_SSL=true and its CA certificate (DB_SSL_CA_FILE).
const sslConfig = () => {
  if (process.env.DB_SSL !== 'true') return {};
  const caFile = process.env.DB_SSL_CA_FILE;
  return {
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      ...(caFile ? { ca: fs.readFileSync(path.resolve(__dirname, caFile), 'utf8') } : {}),
    },
  };
};

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shopaccount',
  waitForConnections: true,
  connectionLimit: 10,
  ...sslConfig(),
});

// ── login: every /api route needs the admin email + password ──────────────────
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

// The password can be changed (or reset) from the Khurram Studio admin page.
// That saves it, hashed, in the website database's admin_login table; read it
// from there so both apps use the same password. Without it, ADMIN_PASSWORD.
const LOGIN_DB = (process.env.LOGIN_DB || 'kstu_orders').replace(/[^\w$]/g, '');
let savedHash = { value: null, at: 0 };
async function changedPasswordHash() {
  if (Date.now() - savedHash.at < 15000) return savedHash.value;
  try {
    const [rows] = await db.query(`SELECT password_hash FROM \`${LOGIN_DB}\`.admin_login WHERE id = 1`);
    savedHash = { value: (rows[0] && rows[0].password_hash) || null, at: Date.now() };
  } catch (err) {
    // no such table here (e.g. local MySQL): keep using ADMIN_PASSWORD
    savedHash = { value: null, at: Date.now() };
  }
  return savedHash.value;
}

// scrypt is slow on purpose: remember the last password that matched
let lastGood = { stored: '', given: null };
const matchesHash = (secret, stored) => {
  const [kind, salt, hash] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const given = crypto.createHash('sha256').update(String(secret)).digest();
  if (lastGood.stored === stored && lastGood.given && crypto.timingSafeEqual(given, lastGood.given)) return true;
  const ok = crypto.timingSafeEqual(crypto.scryptSync(String(secret), salt, 64), Buffer.from(hash, 'hex'));
  if (ok) lastGood = { stored, given };
  return ok;
};

app.use('/api', async (req, res, next) => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    return res.status(503).json({ error: 'ADMIN_EMAIL and ADMIN_PASSWORD must be set on the server.' });
  }
  const givenPassword = String(req.get('x-admin-key') || '');
  const okEmail = sameText(String(req.get('x-admin-email') || '').trim().toLowerCase(), email);
  const stored = await changedPasswordHash();
  const okPassword = stored ? matchesHash(givenPassword, stored) : sameText(givenPassword, password);
  if (!okEmail || !okPassword) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  return next();
});

// Used by the login screen to check the email + password
app.get('/api/login', (_req, res) => {
  res.json({ ok: true });
});

// ── create sale table if not exists ───────────────────────────────────────────
async function createSaleTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS sale (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id VARCHAR(50) NOT NULL UNIQUE,
        sale_date DATE NOT NULL,
        party_name VARCHAR(255) NOT NULL,
        sale_pieces DECIMAL(10,2) NOT NULL,
        sale_rate DECIMAL(10,2) NOT NULL,
        discount DECIMAL(5,2) DEFAULT 0,
        sale_total DECIMAL(10,2) NOT NULL,
        design_code VARCHAR(50),
        design_name VARCHAR(255),
        barcode VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Add missing columns to existing tables
    const alterColumns = [
      `ALTER TABLE sale ADD COLUMN sale_id VARCHAR(50) NOT NULL DEFAULT '' AFTER id`,
      `ALTER TABLE sale ADD COLUMN sale_date DATE NOT NULL DEFAULT '2000-01-01' AFTER sale_id`,
      `ALTER TABLE sale ADD COLUMN party_name VARCHAR(255) NOT NULL DEFAULT '' AFTER sale_date`,
      `ALTER TABLE sale ADD COLUMN sale_pieces DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER party_name`,
      `ALTER TABLE sale ADD COLUMN sale_rate DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER sale_pieces`,
      `ALTER TABLE sale ADD COLUMN discount DECIMAL(5,2) DEFAULT 0 AFTER sale_rate`,
      `ALTER TABLE sale ADD COLUMN sale_total DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount`,
      `ALTER TABLE sale ADD COLUMN design_code VARCHAR(50) AFTER sale_total`,
      `ALTER TABLE sale ADD COLUMN design_name VARCHAR(255) AFTER design_code`,
      `ALTER TABLE sale ADD COLUMN barcode VARCHAR(50) AFTER design_name`,
      `ALTER TABLE sale ADD COLUMN discount_rs DECIMAL(10,2) DEFAULT 0 AFTER discount`,
      `ALTER TABLE sale ADD COLUMN wholesale_rate DECIMAL(10,2) DEFAULT 0 AFTER discount_rs`,
      `ALTER TABLE sale ADD COLUMN profit DECIMAL(10,2) DEFAULT 0 AFTER wholesale_rate`,
    ];
    // Add contact fields to purchase table
    const alterPurchase = [
      `ALTER TABLE purchase ADD COLUMN phone_no VARCHAR(20) AFTER barcode`,
      `ALTER TABLE purchase ADD COLUMN whatsapp VARCHAR(20) AFTER phone_no`,
      `ALTER TABLE purchase ADD COLUMN facebook_id VARCHAR(255) AFTER whatsapp`,
      `ALTER TABLE purchase ADD COLUMN instagram VARCHAR(100) AFTER facebook_id`,
      `ALTER TABLE purchase ADD COLUMN address TEXT AFTER instagram`,
    ];
    for (const sql of alterPurchase) {
      try { await db.query(sql); } catch(e) { /* column already exists */ }
    }
    for (const sql of alterColumns) {
      try { await db.query(sql); } catch(e) { /* column already exists */ }
    }
    try { await db.query('CREATE INDEX idx_sale_date ON sale(sale_date)'); } catch(e) { /* Index may already exist */ }
    try { await db.query('CREATE INDEX idx_party_name ON sale(party_name)'); } catch(e) { /* Index may already exist */ }
    try { await db.query('CREATE INDEX idx_design_code ON sale(design_code)'); } catch(e) { /* Index may already exist */ }
    console.log('Sale table ready');
  } catch (err) {
    console.error('Error creating sale table:', err);
  }
}

// Initialize table on startup
createSaleTable();

// ── GET all purchases ─────────────────────────────────────────────────────────
app.get('/api/purchases', async (req, res) => {
  try {
    const { design_code } = req.query;
    if (design_code) {
      // Filter by design_code
      const [rows] = await db.query('SELECT * FROM purchase WHERE design_code = ? ORDER BY id DESC', [design_code]);
      res.json(rows);
    } else {
      // Get all purchases
      const [rows] = await db.query('SELECT * FROM purchase ORDER BY id DESC');
      res.json(rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET single purchase ───────────────────────────────────────────────────────
app.get('/api/purchases/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM purchase WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST create purchase ──────────────────────────────────────────────────────
app.post('/api/purchases', async (req, res) => {
  const { purchase_no, purchase_date, party_name, challan_no, pieces, wholesale_rate, sale_rate, design_name, purchase_total, barcode, design_code, phone_no, whatsapp, facebook_id, instagram, address } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO purchase (purchase_no, purchase_date, party_name, challan_no, pieces, wholesale_rate, sale_rate, design_name, purchase_total, barcode, design_code, phone_no, whatsapp, facebook_id, instagram, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchase_no, purchase_date, party_name, challan_no, pieces, wholesale_rate, sale_rate, design_name, purchase_total, barcode, design_code, phone_no||null, whatsapp||null, facebook_id||null, instagram||null, address||null]
    );
    res.json({ id: result.insertId, message: 'Purchase saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT rename a party or a design everywhere it is stored ────────────────────
// party:  purchase.party_name + paymenyt.party_name (sale.party_name holds customers, not parties)
// design: purchase.design_name + sale.design_name (design codes are left as they were)
const RENAME_TARGETS = {
  party:  [['purchase', 'party_name'], ['paymenyt', 'party_name']],
  design: [['purchase', 'design_name'], ['sale', 'design_name']],
};
app.put('/api/rename/:kind', async (req, res) => {
  const targets = RENAME_TARGETS[req.params.kind];
  const oldName = String(req.body.old_name || '').trim();
  const newName = String(req.body.new_name || '').trim();
  if (!targets) return res.status(404).json({ error: 'Unknown rename type' });
  if (!oldName || !newName) return res.status(400).json({ error: 'old_name and new_name are required' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const updated = {};
    for (const [table, column] of targets) {
      const [r] = await conn.query(`UPDATE ${table} SET ${column}=? WHERE TRIM(${column}) = ?`, [newName, oldName]);
      updated[table] = r.affectedRows;
    }
    await conn.commit();
    res.json({ updated });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── PUT set the sale rate of one design (all its purchase rows) ────────────────
// Registered before /api/purchases/:id so "sale-rate" is not taken as an id.
app.put('/api/purchases/sale-rate', async (req, res) => {
  const { design_name, sale_rate } = req.body;
  const rate = parseFloat(sale_rate);
  if (!design_name || !(rate > 0)) return res.status(400).json({ error: 'design_name and a sale_rate above 0 are required' });
  try {
    const [result] = await db.query(
      'UPDATE purchase SET sale_rate=? WHERE LOWER(TRIM(design_name)) = LOWER(TRIM(?))',
      [rate, design_name]
    );
    res.json({ updated: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update purchase ───────────────────────────────────────────────────────
app.put('/api/purchases/:id', async (req, res) => {
  const { purchase_no, purchase_date, party_name, challan_no, pieces, wholesale_rate, sale_rate, design_name, purchase_total, barcode, design_code, phone_no, whatsapp, facebook_id, instagram, address } = req.body;
  try {
    await db.query(
      `UPDATE purchase SET purchase_no=?, purchase_date=?, party_name=?, challan_no=?, pieces=?, wholesale_rate=?, sale_rate=?, design_name=?, purchase_total=?, barcode=?, design_code=?, phone_no=?, whatsapp=?, facebook_id=?, instagram=?, address=?
       WHERE id = ?`,
      [purchase_no, purchase_date, party_name, challan_no, pieces, wholesale_rate, sale_rate, design_name, purchase_total, barcode, design_code, phone_no||null, whatsapp||null, facebook_id||null, instagram||null, address||null, req.params.id]
    );
    res.json({ message: 'Purchase updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE purchase ───────────────────────────────────────────────────────────
app.delete('/api/purchases/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM purchase WHERE id = ?', [req.params.id]);
    res.json({ message: 'Purchase deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET all sales ─────────────────────────────────────────────────────────────
app.get('/api/sales', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM sale ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST create sale ──────────────────────────────────────────────────────────
app.post('/api/sales', async (req, res) => {
  const { sale_id, sale_date, party_name, sale_pieces, sale_rate, discount, sale_total, design_code, design_name, barcode, phone_no, whatsapp, facebook_id, instagram, address, wholesale_rate } = req.body;
  const gross = (parseFloat(sale_pieces) || 0) * (parseFloat(sale_rate) || 0);
  const discount_rs = gross * (parseFloat(discount) || 0) / 100;
  const ws = parseFloat(wholesale_rate) || 0;
  const profit = (parseFloat(sale_total) || 0) - (parseFloat(sale_pieces) || 0) * ws;
  try {
    const [result] = await db.query(
      `INSERT INTO sale (sale_id, sale_date, party_name, sale_pieces, sale_rate, discount, discount_rs, wholesale_rate, profit, sale_total, design_code, design_name, barcode, phone_no, whatsapp, facebook_id, instagram, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale_id, sale_date, party_name, sale_pieces, sale_rate, discount, discount_rs, ws, profit, sale_total, design_code, design_name, barcode, phone_no, whatsapp, facebook_id, instagram, address]
    );
    res.json({ id: result.insertId, message: 'Sale saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update sale ───────────────────────────────────────────────────────────
app.put('/api/sales/:id', async (req, res) => {
  const { sale_id, sale_date, party_name, sale_pieces, sale_rate, discount, sale_total, design_code, design_name, barcode, phone_no, whatsapp, facebook_id, instagram, address, wholesale_rate } = req.body;
  const gross = (parseFloat(sale_pieces) || 0) * (parseFloat(sale_rate) || 0);
  const discount_rs = gross * (parseFloat(discount) || 0) / 100;
  const ws = parseFloat(wholesale_rate) || 0;
  const profit = (parseFloat(sale_total) || 0) - (parseFloat(sale_pieces) || 0) * ws;
  try {
    await db.query(
      `UPDATE sale SET sale_id=?, sale_date=?, party_name=?, sale_pieces=?, sale_rate=?, discount=?, discount_rs=?, wholesale_rate=?, profit=?, sale_total=?, design_code=?, design_name=?, barcode=?, phone_no=?, whatsapp=?, facebook_id=?, instagram=?, address=?
       WHERE id = ?`,
      [sale_id, sale_date, party_name, sale_pieces, sale_rate, discount, discount_rs, ws, profit, sale_total, design_code, design_name, barcode, phone_no, whatsapp, facebook_id, instagram, address, req.params.id]
    );
    res.json({ message: 'Sale updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE sale ───────────────────────────────────────────────────────────────
app.delete('/api/sales/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM sale WHERE id = ?', [req.params.id]);
    res.json({ message: 'Sale deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET all payments ──────────────────────────────────────────────────────────
app.get('/api/payments', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM paymenyt ORDER BY payment_date DESC, payment_id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST create payment ───────────────────────────────────────────────────────
app.post('/api/payments', async (req, res) => {
  const { payment_id, payment_date, payment_type, party_name, bank, cheque_no, amount, remarks } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO paymenyt (payment_id, payment_date, payment_type, party_name, bank, cheque_no, amount, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [payment_id, payment_date, payment_type||null, party_name, bank||null, cheque_no||null, amount, remarks||null]
    );
    res.json({ id: result.insertId, message: 'Payment saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update payment ────────────────────────────────────────────────────────
app.put('/api/payments/:id', async (req, res) => {
  const { payment_date, payment_type, party_name, bank, cheque_no, amount, remarks } = req.body;
  try {
    await db.query(
      `UPDATE paymenyt SET payment_date=?, payment_type=?, party_name=?, bank=?, cheque_no=?, amount=?, remarks=?
       WHERE payment_id = ?`,
      [payment_date, payment_type||null, party_name, bank||null, cheque_no||null, amount, remarks||null, req.params.id]
    );
    res.json({ message: 'Payment updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE payment ────────────────────────────────────────────────────────────
app.delete('/api/payments/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM paymenyt WHERE payment_id = ?', [req.params.id]);
    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
