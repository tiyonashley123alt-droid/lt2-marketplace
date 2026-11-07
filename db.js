const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'lt2.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER,
  description TEXT,
  price REAL NOT NULL,
  stock INTEGER DEFAULT 0,
  image TEXT,
  featured INTEGER DEFAULT 0,
  available INTEGER DEFAULT 1,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  obtainability TEXT DEFAULT 'obtainable',
  approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  roblox_username TEXT NOT NULL,
  discord_username TEXT,
  items TEXT NOT NULL,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT DEFAULT 'Pending',
  delivery_status TEXT DEFAULT 'Pending',
  status TEXT DEFAULT 'Pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
`);

// Seed categories
const cats = ['Axes','Rare Items','Wood','Presents','Other Items','Trees & Seeds','Collectibles','Limited Items','Furniture','Decorations','Building Materials','Vehicles','Tools & Equipment','Special Items','Other'];
const insCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
for (const c of cats) insCat.run(c);

// Seed admin
const adminExists = db.prepare('SELECT id FROM admins WHERE username=?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?,?)').run('admin', hash);
}

// Seed products if empty
const prodCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
if (prodCount === 0) {
  const seedPath = path.join(__dirname, 'seed.json');
  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const ins = db.prepare('INSERT INTO products (name,description,price,stock,category_id,image,featured,available) VALUES (?,?,?,?,?,?,?,?)');
    for (const p of seed) {
      ins.run(p.name, p.description||'', p.price, p.stock||999, p.category_id||null, p.image||'📦', p.featured||0, p.available!=null?p.available:1);
    }
    console.log('Seeded', seed.length, 'products');
  }
}

// Seed catalog if empty
const catCount = db.prepare('SELECT COUNT(*) c FROM catalog_items').get().c;
if (catCount === 0) {
  // no-op; catalog populated separately
}

module.exports = db;
