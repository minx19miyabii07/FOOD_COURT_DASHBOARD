const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const db = new DatabaseSync('foodcourt.db');
db.exec('PRAGMA foreign_keys = ON');
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

db.exec(`
CREATE TABLE IF NOT EXISTS menu_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, category TEXT, stall TEXT,
  price REAL NOT NULL, stock INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL, total REAL DEFAULT 0,
  status TEXT DEFAULT 'Pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER, menu_item_id INTEGER, name TEXT,
  quantity INTEGER, subtotal REAL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
`);

if (db.prepare('SELECT COUNT(*) c FROM menu_items').get().c === 0) {
  const ins = db.prepare('INSERT INTO menu_items(name,category,stall,price,stock) VALUES(?,?,?,?,?)');
  [['Chicken Adobo Rice','Meals','Stall A',95,30],['Beef Burger','Snacks','Stall B',85,25],
   ['Pork Sisig','Meals','Stall A',110,20],['French Fries','Snacks','Stall B',50,40],
   ['Iced Tea','Drinks','Stall C',35,50],['Halo-Halo','Dessert','Stall C',75,15]]
   .forEach(r => ins.run(...r));
}

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ---------- MENU CRUD ----------
app.get('/api/menu', (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items ORDER BY id DESC').all());
});
app.post('/api/menu', (req, res) => {
  const { name, category, stall, price, stock } = req.body;
  if (!name || price === undefined || price === '') return bad(res, 'Name and price are required');
  const r = db.prepare('INSERT INTO menu_items(name,category,stall,price,stock) VALUES(?,?,?,?,?)')
    .run(name, category || '', stall || '', Number(price), Number(stock) || 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/menu/:id', (req, res) => {
  const { name, category, stall, price, stock } = req.body;
  if (!name || price === undefined || price === '') return bad(res, 'Name and price are required');
  const r = db.prepare('UPDATE menu_items SET name=?,category=?,stall=?,price=?,stock=? WHERE id=?')
    .run(name, category || '', stall || '', Number(price), Number(stock) || 0, req.params.id);
  if (!r.changes) return bad(res, 'Item not found', 404);
  res.json({ updated: true });
});
app.delete('/api/menu/:id', (req, res) => {
  const r = db.prepare('DELETE FROM menu_items WHERE id=?').run(req.params.id);
  if (!r.changes) return bad(res, 'Item not found', 404);
  res.json({ deleted: true });
});

// ---------- ORDERS CRUD ----------
app.get('/api/orders', (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, (SELECT GROUP_CONCAT(name || ' x' || quantity, ', ')
                 FROM order_items WHERE order_id = o.id) AS items
    FROM orders o ORDER BY o.id DESC`).all());
});
app.post('/api/orders', (req, res) => {
  const { customer_name, items } = req.body;
  if (!customer_name || !Array.isArray(items) || !items.length)
    return bad(res, 'Customer name and at least one item are required');
  try {
    const place = () => {
      db.exec('BEGIN');
      try {
      let total = 0;
      const lines = items.map(i => {
        const m = db.prepare('SELECT * FROM menu_items WHERE id=?').get(i.menu_item_id);
        const qty = Number(i.quantity);
        if (!m) throw new Error('Menu item not found');
        if (!qty || qty < 1) throw new Error('Invalid quantity');
        if (m.stock < qty) throw new Error(`Not enough stock for ${m.name}`);
        total += m.price * qty;
        return { m, qty };
      });
      const o = db.prepare('INSERT INTO orders(customer_name,total) VALUES(?,?)').run(customer_name, total);
      lines.forEach(({ m, qty }) => {
        db.prepare('INSERT INTO order_items(order_id,menu_item_id,name,quantity,subtotal) VALUES(?,?,?,?,?)')
          .run(o.lastInsertRowid, m.id, m.name, qty, m.price * qty);
        db.prepare('UPDATE menu_items SET stock = stock - ? WHERE id=?').run(qty, m.id);
      });
      db.exec('COMMIT');
      return Number(o.lastInsertRowid);
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    };
    res.status(201).json({ id: place() });
  } catch (e) { bad(res, e.message); }
});
app.put('/api/orders/:id', (req, res) => {
  const { status, customer_name } = req.body;
  const valid = ['Pending', 'Preparing', 'Ready', 'Completed'];
  if (status && !valid.includes(status)) return bad(res, 'Invalid status');
  const cur = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!cur) return bad(res, 'Order not found', 404);
  db.prepare('UPDATE orders SET status=?, customer_name=? WHERE id=?')
    .run(status || cur.status, customer_name || cur.customer_name, req.params.id);
  res.json({ updated: true });
});
app.delete('/api/orders/:id', (req, res) => {
  const r = db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  if (!r.changes) return bad(res, 'Order not found', 404);
  res.json({ deleted: true });
});

// ---------- DASHBOARD STATS ----------
app.get('/api/stats', (req, res) => {
  const q = s => db.prepare(s).get();
  res.json({
    totalOrders: q('SELECT COUNT(*) v FROM orders').v,
    pending: q("SELECT COUNT(*) v FROM orders WHERE status='Pending'").v,
    completed: q("SELECT COUNT(*) v FROM orders WHERE status='Completed'").v,
    sales: q('SELECT COALESCE(SUM(total),0) v FROM orders').v,
    topItem: (q('SELECT name, SUM(quantity) q FROM order_items GROUP BY name ORDER BY q DESC LIMIT 1') || {}).name || '-'
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
