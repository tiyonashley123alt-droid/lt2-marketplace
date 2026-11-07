require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (STRIPE_KEY) stripe = require('stripe')(STRIPE_KEY);

// ---------- Auth ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: admin.username });
});

// ---------- Categories ----------
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories').all());
});

// ---------- Products ----------
app.get('/api/products', (req, res) => {
  const { category, q, sort, featured } = req.query;
  let sql = `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE 1=1`;
  const params = [];
  if (category && category !== 'All') { sql += ' AND c.name=?'; params.push(category); }
  if (q) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push('%'+q+'%','%'+q+'%'); }
  if (featured === '1') sql += ' AND p.featured=1';
  if (sort === 'price_asc') sql += ' ORDER BY p.price ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY p.price DESC';
  else sql += ' ORDER BY p.id DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// Admin product management
app.post('/api/admin/products', auth, (req, res) => {
  const { name, description, price, stock, category_id, image, featured, available } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price required' });
  const r = db.prepare('INSERT INTO products(name,description,price,stock,category_id,image,featured,available) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, description||'', price, stock||0, category_id||null, image||'📦', featured?1:0, available?1:0);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/admin/products/:id', auth, (req, res) => {
  const { name, description, price, stock, category_id, image, featured, available } = req.body;
  db.prepare('UPDATE products SET name=?,description=?,price=?,stock=?,category_id=?,image=?,featured=?,available=? WHERE id=?')
    .run(name, description||'', price, stock||0, category_id||null, image||'📦', featured?1:0, available?1:0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', auth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Orders ----------
function genOrderNumber() {
  return 'LT2-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
}

app.post('/api/orders', (req, res) => {
  const { roblox_username, discord_username, items, payment_method } = req.body || {};
  if (!roblox_username || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Missing fields' });
  if (!['card','lt2money','robux'].includes(payment_method)) return res.status(400).json({ error: 'Invalid payment method' });
  if (payment_method === 'robux') return res.status(400).json({ error: 'Robux payments unavailable' });

  // validate stock & compute total
  let total = 0;
  const validated = [];
  for (const it of items) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.id);
    if (!p || !p.available) return res.status(400).json({ error: 'Product unavailable: ' + (p?p.name:it.id) });
    if (it.qty > p.stock) return res.status(400).json({ error: 'Insufficient stock: ' + p.name });
    total += p.price * it.qty;
    validated.push({ id: p.id, name: p.name, price: p.price, qty: it.qty });
  }

  const status = payment_method === 'lt2money' ? 'Awaiting In-Game Payment' : 'Pending';
  const order_number = genOrderNumber();
  db.prepare('INSERT INTO orders(order_number,roblox_username,discord_username,items,total,payment_method,payment_status,delivery_status,order_status) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(order_number, roblox_username, discord_username||null, JSON.stringify(validated), total, payment_method, 'Pending', 'Pending', status);

  // decrement stock
  for (const v of validated) {
    db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(v.qty, v.id);
  }

  res.json({ order_number, total, status });
});

app.get('/api/orders/:number', (req, res) => {
  const { verify } = req.query;
  const o = db.prepare('SELECT * FROM orders WHERE order_number=?').get(req.params.number);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  // simple verification: require roblox username match
  if (verify && verify.toLowerCase() !== o.roblox_username.toLowerCase()) return res.status(403).json({ error: 'Verification failed' });
  res.json({ ...o, items: JSON.parse(o.items) });
});

// Admin orders
app.get('/api/admin/orders', auth, (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status && status !== 'All') { sql += ' AND order_status=?'; params.push(status); }
  if (q) { sql += ' AND (order_number LIKE ? OR roblox_username LIKE ?)'; params.push('%'+q+'%','%'+q+'%'); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params).map(o => ({ ...o, items: JSON.parse(o.items) }));
  res.json(rows);
});

app.put('/api/admin/orders/:id', auth, (req, res) => {
  const { order_status, payment_status, delivery_status } = req.body || {};
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE orders SET order_status=?,payment_status=?,delivery_status=? WHERE id=?')
    .run(order_status||o.order_status, payment_status||o.payment_status, delivery_status||o.delivery_status, req.params.id);
  res.json({ ok: true });
});

// ---------- Stats ----------
app.get('/api/admin/stats', auth, (req, res) => {
  const totalOrders = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const pending = db.prepare("SELECT COUNT(*) c FROM orders WHERE order_status='Pending' OR order_status='Awaiting Payment' OR order_status='Awaiting In-Game Payment'").get().c;
  const completed = db.prepare("SELECT COUNT(*) c FROM orders WHERE order_status='Completed'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='Paid'").get().s;
  const available = db.prepare('SELECT COUNT(*) c FROM products WHERE available=1').get().c;
  const outOfStock = db.prepare('SELECT COUNT(*) c FROM products WHERE stock<=0').get().c;
  res.json({ totalOrders, pending, completed, revenue, available, outOfStock });
});

// ---------- Stripe card payment ----------
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY in .env' });
  const { order_number } = req.body || {};
  const o = db.prepare('SELECT * FROM orders WHERE order_number=?').get(order_number);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (o.payment_method !== 'card') return res.status(400).json({ error: 'Not a card order' });
  const items = JSON.parse(o.items);
  const line_items = items.map(i => ({
    price_data: { currency: 'usd', product_data: { name: i.name }, unit_amount: Math.round(i.price*100) },
    quantity: i.qty
  }));
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${req.headers.origin || 'http://127.0.0.1:8080'}/success.html?order=${order_number}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://127.0.0.1:8080'}/checkout.html?order=${order_number}`,
      metadata: { order_number }
    });
    db.prepare('UPDATE orders SET payment_status=? WHERE order_number=?').run('Pending', order_number);
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const { session_id, order_number } = req.body || {};
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid' && session.metadata.order_number === order_number) {
      db.prepare("UPDATE orders SET payment_status='Paid', order_status='Processing' WHERE order_number=?").run(order_number);
      res.json({ ok: true, paid: true });
    } else {
      res.json({ ok: true, paid: false });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// webhook (optional)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // placeholder: in production verify signature with STRIPE_WEBHOOK_SECRET
  res.json({ received: true });
});

// ---------- Catalog (full game item database) ----------
app.get('/api/catalog', (req, res) => {
  const { category, q, obtainability } = req.query;
  let sql = 'SELECT * FROM catalog_items WHERE 1=1';
  const params = [];
  if (category && category !== 'All') { sql += ' AND category=?'; params.push(category); }
  if (obtainability && obtainability !== 'All') { sql += ' AND obtainability=?'; params.push(obtainability); }
  if (q) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push('%'+q+'%','%'+q+'%'); }
  sql += ' ORDER BY id ASC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/catalog/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM catalog_items WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

app.get('/api/catalog-categories', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT category FROM catalog_items ORDER BY category').all().map(r=>r.category));
});

// Admin catalog management
app.post('/api/admin/catalog', auth, (req, res) => {
  const { name, category, description, image_url, obtainability } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Name and category required' });
  const r = db.prepare('INSERT INTO catalog_items(name,category,description,image_url,obtainability,approved) VALUES (?,?,?,?,?,0)')
    .run(name, category, description||'', image_url||'📦', obtainability||'obtainable');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/admin/catalog/:id', auth, (req, res) => {
  const { name, category, description, image_url, obtainability, approved } = req.body;
  db.prepare('UPDATE catalog_items SET name=?,category=?,description=?,image_url=?,obtainability=?,approved=? WHERE id=?')
    .run(name, category, description||'', image_url||'📦', obtainability||'obtainable', approved?1:0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/catalog/:id', auth, (req, res) => {
  db.prepare('DELETE FROM catalog_items WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Approve catalog item -> create product in shop
app.post('/api/admin/catalog/:id/approve', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM catalog_items WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const cat = db.prepare('SELECT id FROM categories WHERE name=?').get(c.category);
  const catId = cat ? cat.id : null;
  const r = db.prepare('INSERT INTO products(name,category_id,description,price,stock,image,featured,available,obtainability) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(c.name, catId, c.description||'', req.body.price||0, req.body.stock||0, c.image_url||'📦', 0, 1, c.obtainability);
  db.prepare('UPDATE catalog_items SET approved=1 WHERE id=?').run(c.id);
  res.json({ ok: true, product_id: r.lastInsertRowid });
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, HOST, () => console.log('LT2 Marketplace running on http://' + HOST + ':' + PORT));