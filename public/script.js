const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

const { jsPDF } = window.jspdf;

/* --- socket.io client --- */
const socket = io();
socket.on('connect', () => console.log('socket connected', socket.id));
socket.on('orderCreated', (order) => {
  console.log('orderCreated', order);
  loadOrders(); // refresh list (simple approach)
});
socket.on('orderUpdated', (order) => {
  console.log('orderUpdated', order);
  loadOrders();
});

/* --- helper functions (same as before) --- */
function isValidEmail(email) { return /.+@.+\..+/.test(email); }
function isValidPhone(phone) { return /^[+\d\s\-().]{6,20}$/.test(phone); }
function statusToClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'naročeno': case 'naroceno': return 's-naroceno';
    case 'sprejeto': return 's-sprejeto';
    case 'v delu': case 'v-delu': return 's-v-delu';
    case 'končano': case 'koncano': return 's-koncano';
    case 'oddano': return 's-oddano';
    default: return '';
  }
}
function formatDateISO(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function generateOrderPDF(order) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Naročilo', 20, 20);
  doc.setFontSize(10);
  doc.text(`Št. naročila: ${order.orderNumber || ''}`, 20, 30);
  doc.text(`Ime: ${order.name}`, 20, 40);
  doc.text(`E-pošta: ${order.email}`, 20, 50);
  doc.text(`Telefon: ${order.phone}`, 20, 60);
  doc.text(`Naslov: ${order.address}`, 20, 70);
  doc.text(`Storitev: ${order.service}`, 20, 80);
  doc.text(`Status: ${order.status}`, 20, 90);
  doc.text(`Datum: ${order.createdAt ? formatDateISO(order.createdAt) : ''}`, 20, 100);
  let y = 110;
  if (order.items && order.items.length) {
    doc.text('Pozicije:', 20, y);
    y += 10;
    let total = 0;
    order.items.forEach(item => {
      doc.text(`${item.name} - ${item.quantity} × ${item.finalPrice} € = ${item.lineTotal} €`, 20, y);
      total += item.lineTotal || 0;
      y += 10;
    });
    y += 10;
    doc.text(`Skupni znesek: ${total.toFixed(2)} €`, 20, y);
    y += 20;
  }
  if (order.statusHistory && order.statusHistory.length) {
    doc.text('Zgodovina statusa:', 20, y);
    y += 10;
    order.statusHistory.forEach(h => {
      doc.text(`${h.status} - ${formatDateISO(h.timestamp)}`, 20, y);
      y += 10;
    });
  }
  doc.save(`narocilo-${order._id}.pdf`);
}

/* --- main UI functions (unchanged behavior, but kept here for completeness) --- */
let articlesCache = [];

async function loadArticlesCache() {
  try {
    const res = await fetch('/api/articles');
    if (!res.ok) throw new Error('Failed to fetch articles');
    articlesCache = await res.json();
  } catch (err) {
    console.error('Could not load articles', err);
    articlesCache = [];
  }
}

function createArticleSelect(selectedId) {
  const sel = document.createElement('select');
  sel.className = 'article-select';
  const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '— Izberite artikel —';
  sel.appendChild(emptyOpt);
  articlesCache.forEach(a => {
    const opt = document.createElement('option'); opt.value = a._id; opt.textContent = `${a.name} — ${Number(a.finalPrice).toFixed(2)} €`;
    if (selectedId && String(selectedId) === String(a._id)) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function renderOrderItems(container, items) {
  container.innerHTML = '';
  if (!items || !items.length) {
    container.innerHTML = '<i>Ni pozicij.</i>';
    return;
  }
  const ul = document.createElement('div');
  ul.className = 'order-items';
  items.forEach(it => {
    const row = document.createElement('div');
    row.className = 'order-item';
    const qty = it.quantity || 1;
    const name = it.name || '(artikel)';
    const line = (typeof it.lineTotal !== 'undefined') ? Number(it.lineTotal).toFixed(2) : ((it.finalPrice || 0) * qty).toFixed(2);
    row.innerHTML = `<div style="display: flex; justify-content: space-between;"><span><strong>${escapeHtml(name)}</strong></span><span>${qty} × ${Number(it.finalPrice||0).toFixed(2)} € = <strong>${line} €</strong></span></div>`;
    ul.appendChild(row);
  });
  container.appendChild(ul);
}

async function addItemToOrder(orderId, orderEl) {
  const sel = orderEl.querySelector('.article-select');
  const qtyIn = orderEl.querySelector('.article-qty');
  const articleId = sel ? sel.value : '';
  const qty = Math.max(1, parseInt(qtyIn ? qtyIn.value : 1) || 1);
  if (!articleId) { alert('Izberite artikel.'); return; }

  const art = articlesCache.find(a => String(a._id) === String(articleId));
  if (!art) { alert('Artikel ni na voljo.'); return; }

  // read current items from dataset
  let items = [];
  try { items = JSON.parse(orderEl.dataset.items || '[]'); } catch(e){ items = []; }

  // new item
  const newItem = {
    articleId: art._id,
    name: art.name,
    unit: art.unit,
    price: art.price,
    vatPercent: art.vatPercent,
    finalPrice: art.finalPrice,
    quantity: qty,
    lineTotal: Math.round(art.finalPrice * qty * 100) / 100
  };
  items.push(newItem);

  // send update to server
  try {
    const res = await fetch(`/order/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) { const e = await res.json().catch(()=>null); throw new Error(e && e.error ? e.error : 'Server error'); }
    // refresh orders (server will also broadcast)
    loadOrders();
  } catch (err) {
    console.error(err);
    alert('Napaka pri dodajanju pozicije. Preverite konzolo.');
  }
}

async function loadOrders() {
  const list = document.getElementById('ordersList');
  // Save the ID of the topmost visible order
  let topOrderId = null;
  const orderDivs = list.querySelectorAll('.order');
  for (let div of orderDivs) {
    if (div.getBoundingClientRect().top >= 0) {
      topOrderId = div.id.replace('order-', '');
      break;
    }
  }
  list.textContent = 'Nalaganje...';
  try {
    // ensure articles loaded for select options
    if (!articlesCache.length) await loadArticlesCache();

    const url = window.location.pathname === '/archive' ? '/api/archive' : '/orders';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const orders = await res.json();
    if (!orders.length) { list.innerHTML = '<i>Ni še nobenih naročil.</i>'; return; }
    list.innerHTML = '';
    orders.forEach(o => {
      const div = document.createElement('div');
      div.className = 'order ' + statusToClass(o.status);
      div.id = 'order-' + o._id;
      const created = o.createdAt ? formatDateISO(o.createdAt) : '';

      // Prepare items container and dataset
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'items-container';
      const currentItems = o.items || [];
      div.dataset.items = JSON.stringify(currentItems);

      // Render existing items
      renderOrderItems(itemsContainer, currentItems);

      // Calculate and display total
      const total = currentItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
      if (total > 0) {
        const totalDiv = document.createElement('div');
        totalDiv.className = 'order-total';
        totalDiv.innerHTML = `<strong>Skupni znesek: ${total.toFixed(2)} €</strong>`;
        itemsContainer.appendChild(totalDiv);
      }

      // Display status history
      let historyDiv = null;
      if (o.statusHistory && o.statusHistory.length > 1) {
        historyDiv = document.createElement('div');
        historyDiv.className = 'status-history';
        historyDiv.innerHTML = '<strong>Zgodovina statusa:</strong>';
        const ul = document.createElement('ul');
        o.statusHistory.forEach(h => {
          const li = document.createElement('li');
          li.textContent = `${h.status} - ${formatDateISO(h.timestamp)}`;
          ul.appendChild(li);
        });
        historyDiv.appendChild(ul);
      }

      // Add item form
      const addWrap = document.createElement('div');
      addWrap.className = 'add-item-wrap';
      const articleSel = createArticleSelect();
      articleSel.style.marginTop = '8px';
      const qtyIn = document.createElement('input');
      qtyIn.type = 'number'; qtyIn.min = '1'; qtyIn.value = '1'; qtyIn.className = 'article-qty';
      qtyIn.style.width = '80px'; qtyIn.style.marginLeft = '8px';
      const addBtn = document.createElement('button');
      addBtn.className = 'small-btn'; addBtn.textContent = 'Dodaj pozicijo';
      addBtn.style.marginLeft = '8px';
      addBtn.addEventListener('click', () => addItemToOrder(o._id, div));
      addWrap.appendChild(articleSel); addWrap.appendChild(qtyIn); addWrap.appendChild(addBtn);

      const statusSelect = document.createElement('select');
      statusSelect.className = 'status-select';
      STATUS_OPTIONS.forEach(s => {
        const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
        if (o.status === s) opt.selected = true;
        statusSelect.appendChild(opt);
      });

      const updateStatusBtn = document.createElement('button');
      updateStatusBtn.textContent = 'Posodobi status'; updateStatusBtn.className = 'small-btn';
      updateStatusBtn.addEventListener('click', () => updateStatus(o._id, statusSelect.value));

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Uredi'; editBtn.className = 'small-btn';
      editBtn.addEventListener('click', () => openEditModal(o));

      const printBtn = document.createElement('button');
      printBtn.textContent = 'Natisni PDF'; printBtn.className = 'small-btn';
      printBtn.addEventListener('click', () => generateOrderPDF(o));

      div.innerHTML = `
        <strong>${escapeHtml(o.name)}</strong> — ${escapeHtml(o.service)}<br/>
        <strong>Št. naročila: ${escapeHtml(o.orderNumber || '')}</strong><br/>
        <div class="meta">${escapeHtml(o.email)} • ${escapeHtml(o.phone)} • ${escapeHtml(o.address)}${created ? ' • ' + created : ''}</div>
        <div class="meta">Status: <span id="status-${o._id}">${escapeHtml(o.status || 'Naročeno')}</span></div>
      `;

      // append items container and add form
      div.appendChild(itemsContainer);
      div.appendChild(addWrap);

      const controls = document.createElement('div');
      controls.appendChild(statusSelect);
      controls.appendChild(updateStatusBtn);
      controls.appendChild(editBtn);
      controls.appendChild(printBtn);
      div.appendChild(controls);

      if (historyDiv) div.appendChild(historyDiv);

      list.appendChild(div);
    });
    // Scroll to the previously topmost visible order
    if (topOrderId) {
      const targetDiv = document.getElementById('order-' + topOrderId);
      if (targetDiv) {
        targetDiv.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  } catch (err) {
    console.error(err);
    list.innerHTML = '<span style="color:red">Napaka pri nalaganju naročil.</span>';
  }
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`/order/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    const data = await res.json();
    // Update UI only if elements still exist (avoid race with socket-driven reload)
    const statusEl = document.getElementById(`status-${id}`);
    if (statusEl) {
      statusEl.textContent = data.order.status;
      const orderEl = document.getElementById('order-' + id);
      if (orderEl) orderEl.className = 'order ' + statusToClass(data.order.status);
    } else {
      // If element was removed (socket already reloaded list), refresh to ensure consistent UI
      loadOrders();
    }
  } catch (err) {
    console.error(err);
    alert('Napaka pri posodabljanju statusa: ' + (err && err.message ? err.message : 'Neznana napaka') + '. Preverite konzolo za več.');
  }
}

/* Modal editing functions (same as previous implementation). Keep them here or import if you separated files. */
function openEditModal(order) {
  const modal = document.getElementById('editModal');
  if (!modal) { alert('Modal ni na voljo.'); return; }
  modal.setAttribute('aria-hidden', 'false'); modal.style.display = 'flex';
  document.getElementById('edit-name').value = order.name || '';
  document.getElementById('edit-email').value = order.email || '';
  document.getElementById('edit-phone').value = order.phone || '';
  document.getElementById('edit-address').value = order.address || '';
  const srv = document.getElementById('edit-service');
  for (let i=0;i<srv.options.length;i++) { if (srv.options[i].value === order.service) { srv.selectedIndex = i; break; } }
  const stat = document.getElementById('edit-status');
  stat.innerHTML = '';
  STATUS_OPTIONS.forEach(s => {
    const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
    if (order.status === s) opt.selected = true;
    stat.appendChild(opt);
  });
  modal.dataset.editingId = order._id;
  document.getElementById('edit-name').focus();
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none';
  delete modal.dataset.editingId;
}

async function saveEdit() {
  const modal = document.getElementById('editModal');
  const id = modal.dataset.editingId;
  if (!id) return;
  const name = document.getElementById('edit-name').value.trim();
  const email = document.getElementById('edit-email').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  const address = document.getElementById('edit-address').value.trim();
  const service = document.getElementById('edit-service').value;
  const status = document.getElementById('edit-status').value;

  if (!name || !email || !phone || !address) { alert('Ime, email, telefon in naslov morajo biti izpolnjeni.'); return; }
  if (!isValidEmail(email)) { alert('Neveljaven email.'); return; }
  if (!isValidPhone(phone)) { alert('Neveljavna telefonska številka.'); return; }

  try {
    const res = await fetch(`/order/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, address, service, status })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    closeEditModal();
    // server will broadcast; loadOrders() will run on other clients via socket, here refresh to be immediate
    loadOrders();
  } catch (err) {
    console.error(err); alert('Napaka pri posodabljanju naročila. Preverite konzolo.');
  }
}

/* place order and bindings */
async function order() {
  if (!selectedCustomerId) return alert('Izberite stranko iz predlog.');
  const customer = customersCache.find(c => c._id === selectedCustomerId);
  if (!customer) return alert('Izbrana stranka ni na voljo. Osvežite stran.');

  const name = customer.name;
  const email = customer.email || '';
  const phone = customer.phone || '';
  const address = customer.address || '';
  const service = document.getElementById('service').value;

  if (!email || !isValidEmail(email)) return alert('Izbrana stranka nima veljavnega e-poštnega naslova.');
  if (!phone || !isValidPhone(phone)) return alert('Izbrana stranka nima veljavne telefonske številke.');

  try {
    const res = await fetch('/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, address, service })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    // clear selection (optional) — pustimo izbrano stranko izbran
    // osveži seznam naročil
    loadOrders();
  } catch (err) { console.error(err); alert('Napaka pri oddaji naročila. Preverite konzolo.'); }
}

document.addEventListener('DOMContentLoaded', () => {
  const place = document.getElementById('placeOrder');
  if (place) place.addEventListener('click', order);
  const cancel = document.getElementById('edit-cancel');
  const save = document.getElementById('edit-save');
  if (cancel) cancel.addEventListener('click', (e) => { e.preventDefault(); closeEditModal(); });
  if (save) save.addEventListener('click', (e) => { e.preventDefault(); saveEdit(); });

  // customers autocomplete + articles cache then load orders
  loadCustomers().then(() => {
    setupCustomerAutocomplete();
    return loadArticlesCache();
  }).then(() => {
    loadOrders();
  });
});

let customersCache = [];
let selectedCustomerId = null; // id trenutno izbrane stranke

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers');
    if (!res.ok) throw new Error('Failed to fetch customers');
    const customers = await res.json();
    customersCache = customers; // shrani lokalno
  } catch (err) {
    console.error('Could not load customers', err);
  }
}

// Renders suggestion items (up to max 8)
function showCustomerSuggestions(list) {
  const box = document.getElementById('customerSuggestions');
  if (!box) return;
  box.innerHTML = '';
  if (!list || !list.length) { box.setAttribute('aria-hidden', 'true'); return; }
  const max = 8;
  list.slice(0, max).forEach(c => {
    const item = document.createElement('div');
    item.className = 'suggestion';
    item.tabIndex = 0;
    item.dataset.id = c._id;
    item.innerHTML = `<strong>${escapeHtml(c.name)}</strong><div class="s-meta">${escapeHtml(c.email || '')}${c.phone ? ' • ' + escapeHtml(c.phone) : ''}</div>`;
    item.addEventListener('click', () => chooseCustomer(c));
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter') chooseCustomer(c); });
    box.appendChild(item);
  });
  box.setAttribute('aria-hidden', 'false');
}

// Called when user picks a suggestion
function chooseCustomer(c) {
  selectedCustomerId = c._id;
  const input = document.getElementById('customerInput');
  input.value = c.name || '';
  document.getElementById('email').value = c.email || '';
  document.getElementById('phone').value = c.phone || '';
  document.getElementById('address').value = c.address || '';
  // hide suggestions
  const box = document.getElementById('customerSuggestions');
  if (box) { box.innerHTML = ''; box.setAttribute('aria-hidden','true'); }
}

// Filter as user types
function setupCustomerAutocomplete() {
  const input = document.getElementById('customerInput');
  const box = document.getElementById('customerSuggestions');
  if (!input || !box) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    selectedCustomerId = null; // reset selection while typing
    if (!q) { box.innerHTML = ''; box.setAttribute('aria-hidden','true'); return; }
    const filtered = customersCache.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
    showCustomerSuggestions(filtered);
  });

  // hide suggestions on blur (delay to allow click)
  input.addEventListener('blur', () => { setTimeout(() => { box.innerHTML = ''; box.setAttribute('aria-hidden','true'); }, 150); });

  // show all on focus if empty (optional)
  input.addEventListener('focus', () => {
    if (!input.value.trim()) {
      // show top recent customers
      showCustomerSuggestions(customersCache.slice(0,8));
    }
  });
}