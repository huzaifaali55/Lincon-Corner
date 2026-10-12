/* ==================================================
   APP SETTINGS — yahan change karein, poori app mein badal jayega
   ================================================== */
const APP_NAME    = 'Lincoln Corners';       // ⬅️ YAHAN: apna naam likhein
const APP_TAGLINE = 'Management System';     // ⬅️ YAHAN: apni tagline
const APP_ICON    = '🏛️';                    // ⬅️ YAHAN: emoji icon

document.title = APP_NAME + ' — ' + APP_TAGLINE;

/* ================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  token: localStorage.getItem('lc_token'),
  user: null,
  tab: 'dashboard',
  districts: [], corners: [], vendors: [], items: [],
  complaints: [], procurements: [], users: [], summary: null,
  filters: { district_id: '', corner_id: '', status: '', from: '', to: '', search: '' }
};

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (res.status === 401) { state.token = null; localStorage.removeItem('lc_token'); state.user = null; render(); throw new Error('Login required'); }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = s => s ? new Date(s).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' }) : '';
const fmtMoney = n => 'PKR ' + (Number(n) || 0).toLocaleString();

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function modal(title, body, onSubmit) {
  const w = document.createElement('div');
  w.className = 'modal-wrap';
  w.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon" data-close>✕</button></div>
      <form class="modal-body">${body}
        <div class="modal-foot">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
      </form>
    </div>`;
  w.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => w.remove()));
  w.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try { await onSubmit(data); w.remove(); }
    catch (err) { toast(err.message, 'err'); }
  });
  document.body.appendChild(w);
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <h1>${esc(APP_NAME)}</h1>
        <p class="sub">${esc(APP_TAGLINE)}</p>
        <label>Email</label>
        <input id="email" type="email" placeholder="admin@example.com" required>
        <label>Password</label>
        <input id="password" type="password" required>
        <button type="submit">Login</button>
      </form>
    </div>`;
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('#email').value, password: $('#password').value })
      });
      state.token = r.token;
      localStorage.setItem('lc_token', r.token);
      state.user = r.user;
      await loadAll();
      render();
    } catch (err) { toast(err.message, 'err'); }
  });
}

async function loadAll() {
  const [districts, corners, vendors, items] = await Promise.all([
    api('/api/districts'), api('/api/corners'), api('/api/vendors'), api('/api/items')
  ]);
  state.districts = districts;
  state.corners = corners;
  state.vendors = vendors;
  state.items = items;
  if (state.user.role === 'super_admin') {
    state.users = await api('/api/users');
  }
}

function render() {
  if (!state.token || !state.user) { renderLogin(); return; }

  const tabs = [
    ['dashboard', '📊 Dashboard'],
    ['complaints', '🛠️ Complaints'],
    ['corners', '📍 Corners'],
    ['vendors', '🏢 Vendors'],
    ['items', '📦 Items'],
    ['procurements', '🛒 Procurement'],
    ['reports', '📄 Reports'],
    ['districts', '🗺️ Districts'],
    ['users', '👥 Users'],
  ].filter(([k]) => !['districts','users'].includes(k) || state.user.role === 'super_admin');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <h2>${APP_ICON} ${esc(APP_NAME)}</h2>
        ${tabs.map(([k, l]) => `<a data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${l}</a>`).join('')}
        <div class="user-box">
          <strong>${esc(state.user.name || state.user.email)}</strong>
          ${esc(state.user.role)}${state.user.district_id ? ' — D' + state.user.district_id : ''}
          <button id="logout-btn">Logout</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
  $$('.sidebar a').forEach(a => a.addEventListener('click', () => { state.tab = a.dataset.tab; render(); }));
  $('#logout-btn').addEventListener('click', () => {
    state.token = null; state.user = null; localStorage.removeItem('lc_token'); render();
  });
  renderTab();
}

async function renderTab() {
  const m = $('#main');
  m.innerHTML = '<p>Loading…</p>';
  try {
    if (state.tab === 'dashboard') await renderDashboard(m);
    else if (state.tab === 'complaints') await renderComplaints(m);
    else if (state.tab === 'corners') await renderCorners(m);
    else if (state.tab === 'vendors') await renderVendors(m);
    else if (state.tab === 'items') await renderItems(m);
    else if (state.tab === 'procurements') await renderProcurements(m);
    else if (state.tab === 'reports') await renderReports(m);
    else if (state.tab === 'districts') await renderDistricts(m);
    else if (state.tab === 'users') await renderUsers(m);
  } catch (e) { m.innerHTML = '<p style="color:red">' + esc(e.message) + '</p>'; }
}

async function renderDashboard(m) {
  state.summary = await api('/api/summary');
  const t = state.summary.totals;
  const bars = arr => arr.length
    ? arr.map(x => {
        const max = Math.max(...arr.map(y => y.count || y.jobs || 0)) || 1;
        const v = x.count || x.jobs || 0;
        return `<div class="bar-row"><div class="name">${esc(x.district || x.vendor || x.item || '—')}</div>
          <div class="bar" style="width:${(v / max) * 300}px"></div>
          <div class="val">${v}${x.cost ? ' · ' + fmtMoney(x.cost) : ''}</div></div>`;
      }).join('')
    : '<p style="color:#999;font-size:13px">No data</p>';

  m.innerHTML = `
    <h1>📊 Dashboard</h1>
    <div class="cards">
      <div class="card"><div class="num">${t.total || 0}</div><div class="lbl">Total Complaints</div></div>
      <div class="card warn"><div class="num">${t.pending || 0}</div><div class="lbl">Pending</div></div>
      <div class="card"><div class="num">${t.in_progress || 0}</div><div class="lbl">In Progress</div></div>
      <div class="card ok"><div class="num">${t.resolved || 0}</div><div class="lbl">Resolved</div></div>
      <div class="card"><div class="num">${fmtMoney(t.total_cost)}</div><div class="lbl">Total Repair Cost</div></div>
    </div>
    <div class="bar-list"><h3>Complaints by District</h3>${bars(state.summary.byDistrict)}</div>
    <div class="bar-list"><h3>Top Vendors (by jobs)</h3>${bars(state.summary.topVendors)}</div>
    <div class="bar-list"><h3>Top Items (most repairs)</h3>${bars(state.summary.topItems)}</div>`;
}

async function renderComplaints(m) {
  const f = state.filters;
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => v && qs.set(k, v));
  state.complaints = await api('/api/complaints?' + qs.toString());

  const cornerOptions = state.corners
    .filter(c => !f.district_id || String(c.district_id) === String(f.district_id))
    .map(c => `<option value="${c.id}" ${String(f.corner_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)} — ${esc(c.district_name)}</option>`).join('');

  m.innerHTML = `
    <h1>🛠️ Complaints</h1>
    <div class="toolbar">
      <select id="f-district"><option value="">All Districts</option>
        ${state.districts.map(d => `<option value="${d.id}" ${String(f.district_id) === String(d.id) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
      </select>
      <select id="f-corner"><option value="">All Corners</option>${cornerOptions}</select>
      <select id="f-status">
        <option value="">All Status</option>
        ${['Pending','In Progress','Resolved'].map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input type="date" id="f-from" value="${f.from}">
      <input type="date" id="f-to" value="${f.to}">
      <input class="grow" id="f-search" placeholder="Search…" value="${esc(f.search)}">
      <button class="btn ghost" id="clear-f">Clear</button>
      <button class="btn" id="export-csv">⬇ CSV</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>#</th><th>Date</th><th>District</th><th>Corner</th><th>Item</th>
          <th>Description</th><th>Priority</th><th>Status</th><th>Vendor</th>
          <th>Cost</th><th>Reported By</th><th></th>
        </tr></thead>
        <tbody>
          ${state.complaints.length ? state.complaints.map(c => `
            <tr>
              <td>${c.id}</td>
              <td>${fmtDate(c.created_at)}</td>
              <td>${esc(c.district_name || c.district_name_raw)}</td>
              <td>${esc(c.corner_name || c.corner_name_raw)}</td>
              <td>${esc(c.item_name_raw)}${c.item_number_raw ? ' (' + esc(c.item_number_raw) + ')' : ''}</td>
              <td title="${esc(c.description)}">${esc((c.description || '').slice(0, 50))}${(c.description||'').length>50?'…':''}</td>
              <td>${esc(c.priority)}</td>
              <td><span class="badge b-${c.status.replace(' ', '')}">${esc(c.status)}</span></td>
              <td>${esc(c.vendor_name || '—')}</td>
              <td>${c.repair_cost ? fmtMoney(c.repair_cost) : '—'}</td>
              <td>${esc(c.reported_by)}</td>
              <td><button class="btn sm" data-edit="${c.id}">Update</button></td>
            </tr>`).join('') : `<tr><td colspan="12" style="text-align:center;color:#999;padding:30px">No complaints</td></tr>`}
        </tbody>
      </table>
    </div>`;

  const bind = (id, key) => $('#' + id).addEventListener('change', e => {
    state.filters[key] = e.target.value; renderTab();
  });
  bind('f-district', 'district_id');
  bind('f-corner', 'corner_id');
  bind('f-status', 'status');
  bind('f-from', 'from');
  bind('f-to', 'to');
  let st;
  $('#f-search').addEventListener('input', e => {
    state.filters.search = e.target.value;
    clearTimeout(st); st = setTimeout(renderTab, 350);
  });
  $('#clear-f').addEventListener('click', () => { state.filters = { district_id: '', corner_id: '', status: '', from: '', to: '', search: '' }; renderTab(); });
  $('#export-csv').addEventListener('click', () => {
    fetch('/api/reports/complaints.csv?' + qs.toString(), { headers: { Authorization: 'Bearer ' + state.token } })
      .then(r => r.blob()).then(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'complaints-' + Date.now() + '.csv'; a.click();
      });
  });
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => editComplaint(Number(b.dataset.edit))));
}

function editComplaint(id) {
  const c = state.complaints.find(x => x.id === id);
  if (!c) return;
  const body = `
    <p><strong>#${c.id}</strong> — ${esc(c.corner_name || c.corner_name_raw)} · ${esc(c.district_name || c.district_name_raw)}</p>
    <p style="margin:8px 0;color:#555">${esc(c.description)}</p>
    ${c.photo_url ? `<p><a href="${esc(c.photo_url)}" target="_blank">📷 View Photo</a></p>` : ''}
    <label>Status</label>
    <select name="status">
      ${['Pending','In Progress','Resolved'].map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <label>Assign Vendor</label>
    <select name="assigned_vendor_id">
      <option value="">— None —</option>
      ${state.vendors.map(v => `<option value="${v.id}" ${c.assigned_vendor_id === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
    </select>
    <label>Repair Cost (PKR)</label>
    <input type="number" name="repair_cost" step="0.01" value="${c.repair_cost || 0}">
    <label>Admin Notes</label>
    <textarea name="admin_notes" rows="3">${esc(c.admin_notes || '')}</textarea>`;
  modal('Update Complaint #' + id, body, async data => {
    data.repair_cost = Number(data.repair_cost) || 0;
    await api('/api/complaints/' + id, { method: 'PATCH', body: JSON.stringify(data) });
    toast('Updated ✓');
    renderTab();
  });
}

async function renderCorners(m) {
  state.corners = await api('/api/corners');
  m.innerHTML = `
    <h1>📍 Corners</h1>
    <div class="toolbar"><button class="btn" id="add">+ Add Corner</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th>District</th><th>Location</th><th></th></tr></thead>
      <tbody>${state.corners.map(c => `
        <tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${esc(c.district_name)}</td>
        <td>${esc(c.location)}</td>
        <td>
          <button class="btn sm ghost" data-e="${c.id}">Edit</button>
          ${state.user.role === 'super_admin' ? `<button class="btn sm danger" data-d="${c.id}">Del</button>` : ''}
        </td></tr>`).join('')}</tbody>
    </table></div>`;
  $('#add').addEventListener('click', () => cornerForm());
  $$('[data-e]').forEach(b => b.addEventListener('click', () => cornerForm(state.corners.find(x => x.id === Number(b.dataset.e)))));
  $$('[data-d]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete?')) return;
    await api('/api/corners/' + b.dataset.d, { method: 'DELETE' });
    toast('Deleted'); renderTab();
  }));
}
function cornerForm(c) {
  const distOpts = state.districts.map(d => `<option value="${d.id}" ${c && c.district_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  const body = `<label>Name</label><input name="name" required value="${esc(c?.name || '')}">
    <label>District</label><select name="district_id" required>${distOpts}</select>
    <label>Location</label><input name="location" value="${esc(c?.location || '')}">`;
  modal(c ? 'Edit Corner' : 'Add Corner', body, async data => {
    if (c) await api('/api/corners/' + c.id, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/corners', { method: 'POST', body: JSON.stringify(data) });
    toast('Saved ✓'); renderTab();
  });
}

async function renderVendors(m) {
  state.vendors = await api('/api/vendors');
  m.innerHTML = `
    <h1>🏢 Vendors</h1>
    <div class="toolbar"><button class="btn" id="add">+ Add Vendor</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Specialty</th><th>Notes</th><th></th></tr></thead>
      <tbody>${state.vendors.map(v => `
        <tr><td>${v.id}</td><td>${esc(v.name)}</td><td>${esc(v.contact_person)}</td>
        <td>${esc(v.phone)}</td><td>${esc(v.email)}</td><td>${esc(v.specialty)}</td>
        <td>${esc((v.notes||'').slice(0,40))}</td>
        <td>
          <button class="btn sm ghost" data-e="${v.id}">Edit</button>
          ${state.user.role === 'super_admin' ? `<button class="btn sm danger" data-d="${v.id}">Del</button>` : ''}
        </td></tr>`).join('')}</tbody>
    </table></div>`;
  $('#add').addEventListener('click', () => vendorForm());
  $$('[data-e]').forEach(b => b.addEventListener('click', () => vendorForm(state.vendors.find(x => x.id === Number(b.dataset.e)))));
  $$('[data-d]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete?')) return;
    await api('/api/vendors/' + b.dataset.d, { method: 'DELETE' });
    toast('Deleted'); renderTab();
  }));
}
function vendorForm(v) {
  const body = `
    <label>Name</label><input name="name" required value="${esc(v?.name || '')}">
    <label>Contact Person</label><input name="contact_person" value="${esc(v?.contact_person || '')}">
    <label>Phone</label><input name="phone" value="${esc(v?.phone || '')}">
    <label>Email</label><input name="email" value="${esc(v?.email || '')}">
    <label>Address</label><input name="address" value="${esc(v?.address || '')}">
    <label>Specialty</label><input name="specialty" value="${esc(v?.specialty || '')}">
    <label>Notes</label><textarea name="notes" rows="2">${esc(v?.notes || '')}</textarea>`;
  modal(v ? 'Edit Vendor' : 'Add Vendor', body, async data => {
    if (v) await api('/api/vendors/' + v.id, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/vendors', { method: 'POST', body: JSON.stringify(data) });
    toast('Saved ✓'); renderTab();
  });
}

async function renderItems(m) {
  state.items = await api('/api/items');
  m.innerHTML = `
    <h1>📦 Items</h1>
    <div class="toolbar"><button class="btn" id="add">+ Add Item</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Item #</th><th>Sub Item #</th><th>Description</th><th></th></tr></thead>
      <tbody>${state.items.map(i => `
        <tr><td>${i.id}</td><td>${esc(i.name)}</td><td>${esc(i.item_number)}</td>
        <td>${esc(i.sub_item_number)}</td><td>${esc(i.description)}</td>
        <td>
          <button class="btn sm ghost" data-e="${i.id}">Edit</button>
          ${state.user.role === 'super_admin' ? `<button class="btn sm danger" data-d="${i.id}">Del</button>` : ''}
        </td></tr>`).join('')}</tbody>
    </table></div>`;
  $('#add').addEventListener('click', () => itemForm());
  $$('[data-e]').forEach(b => b.addEventListener('click', () => itemForm(state.items.find(x => x.id === Number(b.dataset.e)))));
  $$('[data-d]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete?')) return;
    await api('/api/items/' + b.dataset.d, { method: 'DELETE' });
    toast('Deleted'); renderTab();
  }));
}
function itemForm(it) {
  const body = `
    <label>Name</label><input name="name" required value="${esc(it?.name || '')}">
    <label>Item Number</label><input name="item_number" value="${esc(it?.item_number || '')}">
    <label>Sub Item Number</label><input name="sub_item_number" value="${esc(it?.sub_item_number || '')}">
    <label>Description</label><textarea name="description" rows="2">${esc(it?.description || '')}</textarea>`;
  modal(it ? 'Edit Item' : 'Add Item', body, async data => {
    if (it) await api('/api/items/' + it.id, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/items', { method: 'POST', body: JSON.stringify(data) });
    toast('Saved ✓'); renderTab();
  });
}

async function renderProcurements(m) {
  state.procurements = await api('/api/procurements');
  m.innerHTML = `
    <h1>🛒 Procurement (5 Quotations per Request)</h1>
    <div class="toolbar"><button class="btn" id="add">+ New Procurement</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Title</th><th>Item</th><th>Qty</th><th>District</th><th>Status</th><th>Quotes</th><th>Created</th><th></th></tr></thead>
      <tbody>${state.procurements.map(p => `
        <tr>
          <td>${p.id}</td><td>${esc(p.title)}</td><td>${esc(p.item_name || p.item_description || '—')}</td>
          <td>${p.quantity}</td><td>${esc(p.district_name || '—')}</td>
          <td><span class="badge b-${p.status}">${esc(p.status)}</span></td>
          <td>${p.quotes_count}/5</td>
          <td>${fmtDate(p.created_at)}</td>
          <td><button class="btn sm" data-v="${p.id}">Manage</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  $('#add').addEventListener('click', procForm);
  $$('[data-v]').forEach(b => b.addEventListener('click', () => viewProcurement(Number(b.dataset.v))));
}
function procForm() {
  const distOpts = state.districts.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  const itemOpts = '<option value="">— None —</option>' + state.items.map(i => `<option value="${i.id}">${esc(i.name)} ${i.item_number ? '('+esc(i.item_number)+')' : ''}</option>`).join('');
  const body = `
    <label>Title</label><input name="title" required placeholder="e.g. Projector repair for Lahore Corner">
    <label>Item (from list, optional)</label><select name="item_id">${itemOpts}</select>
    <label>Free-text Item Description</label><input name="item_description">
    <label>Quantity</label><input type="number" name="quantity" value="1" min="1">
    <label>Requested By</label><input name="requested_by">
    <label>District</label><select name="district_id">${distOpts}</select>
    <label>Notes</label><textarea name="notes" rows="2"></textarea>`;
  modal('New Procurement', body, async data => {
    await api('/api/procurements', { method: 'POST', body: JSON.stringify(data) });
    toast('Created ✓'); renderTab();
  });
}
function viewProcurement(id) {
  const p = state.procurements.find(x => x.id === id);
  if (!p) return;
  const rowsHtml = p.quotations.map(q => `
    <tr>
      <td>${esc(q.vendor_name || q.vendor_name_raw)}</td>
      <td>${fmtMoney(q.price)}</td>
      <td>${q.delivery_days || '—'}</td>
      <td>${esc(q.notes || '')}</td>
      <td>${p.selected_quotation_id === q.id ? '✅' : `<button class="btn sm" data-sel="${q.id}">Select</button>`}
        <button class="btn sm danger" data-del="${q.id}">Del</button></td>
    </tr>`).join('');
  const vendorOpts = state.vendors.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  const body = `
    <p><strong>${esc(p.title)}</strong> — Qty ${p.quantity}</p>
    <p style="color:#666;margin:8px 0">${esc(p.item_description || '')}</p>
    <h4 style="margin-top:16px">Quotations (${p.quotations.length}/5)</h4>
    <table style="width:100%;font-size:13px">
      <thead><tr><th>Vendor</th><th>Price</th><th>Days</th><th>Notes</th><th></th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#999;padding:10px">No quotations yet</td></tr>'}</tbody>
    </table>
    ${p.quotations.length < 5 ? `
      <h4 style="margin-top:18px">Add Quotation</h4>
      <form id="q-form" style="background:#f7f9fc;padding:12px;border-radius:8px;margin-top:8px">
        <label>Vendor</label><select name="vendor_id" required>${vendorOpts}</select>
        <label>Price (PKR)</label><input type="number" name="price" step="0.01" required>
        <label>Delivery Days</label><input type="number" name="delivery_days">
        <label>Notes</label><input name="notes">
        <button class="btn" style="margin-top:12px" type="submit">Add Quote</button>
      </form>` : '<p style="margin-top:12px;color:#92400e">Maximum 5 quotations reached.</p>'}
    <hr style="margin:18px 0">
    <label>Status</label>
    <select id="p-status">
      ${['Open','Awarded','Closed'].map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <button class="btn" id="save-status" style="margin-top:10px">Update Status</button>
  `;
  const w = document.createElement('div');
  w.className = 'modal-wrap';
  w.innerHTML = `<div class="modal"><div class="modal-head"><h3>Procurement #${p.id}</h3>
    <button class="icon" data-close>✕</button></div>
    <div class="modal-body">${body}</div></div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); renderTab(); };
  w.querySelector('[data-close]').addEventListener('click', close);
  w.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', async () => {
    await api('/api/procurements/' + p.id, { method: 'PATCH', body: JSON.stringify({ status: 'Awarded', selected_quotation_id: Number(b.dataset.sel), notes: p.notes || '' }) });
    toast('Selected ✓'); close();
  }));
  w.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete quote?')) return;
    await api('/api/quotations/' + b.dataset.del, { method: 'DELETE' });
    close();
  }));
  const qf = w.querySelector('#q-form');
  if (qf) qf.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(qf).entries());
    d.price = Number(d.price) || 0;
    d.delivery_days = Number(d.delivery_days) || 0;
    try {
      await api('/api/procurements/' + p.id + '/quotations', { method: 'POST', body: JSON.stringify(d) });
      close();
    } catch (err) { toast(err.message, 'err'); }
  });
  w.querySelector('#save-status').addEventListener('click', async () => {
    const status = w.querySelector('#p-status').value;
    await api('/api/procurements/' + p.id, { method: 'PATCH', body: JSON.stringify({ status, selected_quotation_id: p.selected_quotation_id, notes: p.notes || '' }) });
    toast('Status updated'); close();
  });
}

async function renderReports(m) {
  m.innerHTML = `
    <h1>📄 Reports</h1>
    <div class="table-wrap" style="padding:24px">
      <p style="margin-bottom:16px;color:#555">
        Yahan se aap filters lagakar poori complaint history CSV mein download kar sakte hain (Excel mein khul jayegi).
      </p>
      <label>District</label>
      <select id="r-district"><option value="">All</option>
        ${state.districts.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
      <label>Corner</label>
      <select id="r-corner"><option value="">All</option>
        ${state.corners.map(c => `<option value="${c.id}" data-d="${c.district_id}">${esc(c.name)} — ${esc(c.district_name)}</option>`).join('')}</select>
      <label>Status</label>
      <select id="r-status"><option value="">All</option>
        ${['Pending','In Progress','Resolved'].map(s => `<option>${s}</option>`).join('')}</select>
      <label>From Date</label><input type="date" id="r-from">
      <label>To Date</label><input type="date" id="r-to">
      <div style="margin-top:20px;display:flex;gap:10px">
        <button class="btn" id="dl-complaints">⬇ Download Complaints CSV</button>
        <button class="btn ghost" id="dl-proc">⬇ Download Procurements CSV</button>
      </div>
    </div>`;

  $('#dl-complaints').addEventListener('click', () => {
    const p = new URLSearchParams();
    const g = id => $('#' + id).value;
    if (g('r-district')) p.set('district_id', g('r-district'));
    if (g('r-corner')) p.set('corner_id', g('r-corner'));
    if (g('r-status')) p.set('status', g('r-status'));
    if (g('r-from')) p.set('from', g('r-from'));
    if (g('r-to')) p.set('to', g('r-to'));
    fetch('/api/reports/complaints.csv?' + p.toString(), { headers: { Authorization: 'Bearer ' + state.token } })
      .then(r => r.blob()).then(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'complaints-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
      });
  });

  $('#dl-proc').addEventListener('click', async () => {
    const procs = await api('/api/procurements');
    const rows = [['ID','Title','Item','Qty','District','Status','Vendor','Price','Delivery Days']];
    procs.forEach(p => {
      if (p.quotations.length === 0) {
        rows.push([p.id, p.title, p.item_name || p.item_description, p.quantity, p.district_name || '', p.status, '', '', '']);
      } else {
        p.quotations.forEach(q => {
          const selected = p.selected_quotation_id === q.id ? 'YES' : '';
          rows.push([p.id, p.title, p.item_name || p.item_description, p.quantity, p.district_name || '', p.status, (selected ? '✓ ' : '') + (q.vendor_name || q.vendor_name_raw), q.price, q.delivery_days]);
        });
      }
    });
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'procurements-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  });
}

async function renderDistricts(m) {
  state.districts = await api('/api/districts');
  m.innerHTML = `
    <h1>🗺️ Districts</h1>
    <div class="toolbar"><button class="btn" id="add">+ Add District</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th></th></tr></thead>
      <tbody>${state.districts.map(d => `
        <tr><td>${d.id}</td><td>${esc(d.name)}</td>
        <td><button class="btn sm ghost" data-e="${d.id}">Edit</button>
        <button class="btn sm danger" data-d="${d.id}">Del</button></td></tr>`).join('')}</tbody>
    </table></div>`;
  $('#add').addEventListener('click', () => districtForm());
  $$('[data-e]').forEach(b => b.addEventListener('click', () => districtForm(state.districts.find(x => x.id === Number(b.dataset.e)))));
  $$('[data-d]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete? Corners linked to this district may break.')) return;
    await api('/api/districts/' + b.dataset.d, { method: 'DELETE' });
    toast('Deleted'); renderTab();
  }));
}
function districtForm(d) {
  modal(d ? 'Edit District' : 'Add District',
    `<label>Name</label><input name="name" required value="${esc(d?.name || '')}">`,
    async data => {
      if (d) await api('/api/districts/' + d.id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/api/districts', { method: 'POST', body: JSON.stringify(data) });
      toast('Saved ✓'); renderTab();
    });
}

async function renderUsers(m) {
  state.users = await api('/api/users');
  state.districts = await api('/api/districts');
  m.innerHTML = `
    <h1>👥 Users (Admins)</h1>
    <div class="toolbar"><button class="btn" id="add">+ Add User</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>District</th><th></th></tr></thead>
      <tbody>${state.users.map(u => {
        const d = state.districts.find(x => x.id === u.district_id);
        return `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
          <td>${esc(u.role)}</td><td>${d ? esc(d.name) : '—'}</td>
          <td>${u.role !== 'super_admin' ? `<button class="btn sm danger" data-d="${u.id}">Del</button>` : ''}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
  $('#add').addEventListener('click', userForm);
  $$('[data-d]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete user?')) return;
    await api('/api/users/' + b.dataset.d, { method: 'DELETE' });
    toast('Deleted'); renderTab();
  }));
}
function userForm() {
  const distOpts = '<option value="">— None —</option>' + state.districts.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  const body = `
    <label>Name</label><input name="name" required>
    <label>Email</label><input type="email" name="email" required>
    <label>Password</label><input type="password" name="password" required minlength="6">
    <label>Role</label>
    <select name="role"><option value="district_admin">District Admin</option><option value="super_admin">Super Admin</option></select>
    <label>District (for district admins)</label><select name="district_id">${distOpts}</select>`;
  modal('Add User', body, async data => {
    await api('/api/users', { method: 'POST', body: JSON.stringify(data) });
    toast('Created ✓'); renderTab();
  });
}

(async function boot() {
  if (state.token) {
    try { state.user = await api('/api/me'); await loadAll(); }
    catch { state.token = null; state.user = null; }
  }
  render();
})();