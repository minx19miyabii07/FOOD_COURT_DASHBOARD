const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n).toFixed(2);
let menu = [], cart = [];

async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
const run = async fn => { try { await fn(); } catch (e) { alert(e.message); } };

// ----- Stats -----
async function loadStats() {
  const s = await api('/api/stats');
  $('#cards').innerHTML = `
    <div class="card"><small>Total Orders</small><b>${s.totalOrders}</b></div>
    <div class="card"><small>Pending</small><b>${s.pending}</b></div>
    <div class="card"><small>Completed</small><b>${s.completed}</b></div>
    <div class="card"><small>Total Sales</small><b>₱${money(s.sales)}</b></div>
    <div class="card"><small>Top Item</small><b style="font-size:16px">${esc(s.topItem)}</b></div>`;
}

// ----- Menu CRUD -----
async function loadMenu() {
  menu = await api('/api/menu');
  $('#menuBody').innerHTML = menu.map(m => `
    <tr><td>${m.id}</td><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${esc(m.stall)}</td>
    <td>₱${money(m.price)}</td><td>${m.stock}</td>
    <td><button class="blue" onclick="editMenu(${m.id})">Edit</button>
        <button class="red" onclick="delMenu(${m.id})">Delete</button></td></tr>`).join('');
  $('#oItem').innerHTML = menu.map(m =>
    `<option value="${m.id}">${esc(m.name)} - ₱${money(m.price)} (stock ${m.stock})</option>`).join('');
}
function resetMenu() {
  ['mId','mName','mCategory','mStall','mPrice','mStock'].forEach(i => $('#' + i).value = '');
  $('#mSave').textContent = 'Add Item';
}
function editMenu(id) {
  const m = menu.find(x => x.id === id);
  $('#mId').value = m.id; $('#mName').value = m.name; $('#mCategory').value = m.category;
  $('#mStall').value = m.stall; $('#mPrice').value = m.price; $('#mStock').value = m.stock;
  $('#mSave').textContent = 'Update Item';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const saveMenu = () => run(async () => {
  const body = { name: $('#mName').value.trim(), category: $('#mCategory').value.trim(),
    stall: $('#mStall').value.trim(), price: $('#mPrice').value, stock: $('#mStock').value };
  const id = $('#mId').value;
  id ? await api('/api/menu/' + id, 'PUT', body) : await api('/api/menu', 'POST', body);
  resetMenu(); await refresh();
});
const delMenu = id => run(async () => {
  if (!confirm('Delete this menu item?')) return;
  await api('/api/menu/' + id, 'DELETE'); await refresh();
});

// ----- Cart / New Order -----
function addToCart() {
  const id = Number($('#oItem').value), qty = Number($('#oQty').value);
  const m = menu.find(x => x.id === id);
  if (!m || qty < 1) return alert('Choose an item and a valid quantity');
  const ex = cart.find(c => c.menu_item_id === id);
  ex ? ex.quantity += qty : cart.push({ menu_item_id: id, name: m.name, price: m.price, quantity: qty });
  renderCart();
}
function removeFromCart(i) { cart.splice(i, 1); renderCart(); }
function renderCart() {
  $('#cart').innerHTML = cart.map((c, i) => `<li>${esc(c.name)} x${c.quantity} = ₱${money(c.price * c.quantity)}
    <button class="red" onclick="removeFromCart(${i})">x</button></li>`).join('');
  $('#cartTotal').textContent = money(cart.reduce((t, c) => t + c.price * c.quantity, 0));
}
const placeOrder = () => run(async () => {
  await api('/api/orders', 'POST', { customer_name: $('#oName').value.trim(),
    items: cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity })) });
  cart = []; $('#oName').value = ''; renderCart(); await refresh();
});

// ----- Orders CRUD -----
async function loadOrders() {
  const orders = await api('/api/orders');
  const st = ['Pending', 'Preparing', 'Ready', 'Completed'];
  $('#orderBody').innerHTML = orders.map(o => `
    <tr><td>${o.id}</td><td>${esc(o.customer_name)}</td><td>${esc(o.items)}</td><td>₱${money(o.total)}</td>
    <td><select onchange="setStatus(${o.id}, this.value)">
      ${st.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td>${esc(o.created_at)}</td>
    <td><button class="red" onclick="delOrder(${o.id})">Delete</button></td></tr>`).join('');
}
const setStatus = (id, status) => run(async () => { await api('/api/orders/' + id, 'PUT', { status }); await refresh(); });
const delOrder = id => run(async () => {
  if (!confirm('Delete this order?')) return;
  await api('/api/orders/' + id, 'DELETE'); await refresh();
});

async function refresh() { await Promise.all([loadStats(), loadMenu(), loadOrders()]); }
refresh();
