const Database = require('better-sqlite3');
const path = require('path');
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
  image_url TEXT,
  featured INTEGER DEFAULT 0,
  available INTEGER DEFAULT 1,
  obtainability TEXT DEFAULT 'obtainable',
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

const cats = ['Axes','Wood','Trees & Seeds','Presents','Collectibles','Rare Items','Limited Items','Furniture','Decorations','Building Materials','Vehicles','Tools & Equipment','Special Items','Other'];
const insCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
cats.forEach(c => insCat.run(c));

const adminCount = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
if (adminCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?,?)').run('admin', hash);
}

const catalogCount = db.prepare('SELECT COUNT(*) c FROM catalog_items').get().c;
if (catalogCount === 0) {
  const ins = db.prepare('INSERT INTO catalog_items (name, category, description, obtainability, approved) VALUES (?,?,?,?,?)');
  const items = [
    ['Basic Hatchet','Axes','Starter axe given to new players.','obtainable',0],
    ['Plain Axe','Axes','Basic axe available from the shop.','obtainable',0],
    ['Rukiryaxe (Many Axe)','Axes','Multi-hit axe that chops several trees at once.','rare',0],
    ['Fire Axe','Axes','Axe with a fiery appearance.','rare',0],
    ['End Times Axe','Axes','Highly valuable limited axe.','limited',0],
    ['Bird Axe','Axes','Axe associated with the Bird event.','limited',0],
    ['Oak','Wood','Common wood type.','obtainable',0],
    ['Elm','Wood','Common wood type.','obtainable',0],
    ['Cherry','Wood','Common wood type.','obtainable',0],
    ['Walnut','Wood','Common wood type.','obtainable',0],
    ['Fir','Wood','Common wood type.','obtainable',0],
    ['Pine','Wood','Common wood type.','obtainable',0],
    ['Lava Wood','Wood','Rare wood found in volcanic areas.','rare',0],
    ['Spook Wood','Wood','Halloween-themed rare wood.','limited',0],
    ['Phantom Wood','Wood','Rare ghostly wood.','rare',0],
    ['Present','Presents','Gift box item.','obtainable',0],
    ['Cave Crawler','Collectibles','Collectible creature item.','rare',0],
    ['Golden Axe','Collectibles','Golden cosmetic axe.','limited',0],
    ['Tree Seed','Trees & Seeds','Seed used to plant trees (availability varies).','obtainable',0],
    ['Wood Truck','Vehicles','Vehicle used to transport wood.','obtainable',0],
    ['Sawmill','Tools & Equipment','Processes wood into planks.','obtainable',0],
  ];
  items.forEach(i => ins.run(...i));
}

module.exports = db;
