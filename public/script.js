const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

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

/* --- main UI functions (unchanged behavior, but kept here for completeness) --- */
async function loadOrders() {
  const list = document.getElementById('ordersList');
  list.textContent = 'Nalaganje...';
  try {
    const res = await fetch('/orders');
    if (!res.ok) throw new Error('Network response not ok');
    const orders = await res.json();
    if (!orders.length) { list.innerHTML = '<i>Ni še nobenih naročil.</i>'; return; }
    list.innerHTML = '';
    orders.forEach(o => {
      const div = document.createElement('div');
      div.className = 'order ' + statusToClass(o.status);
      div.id = 'order-' + o._id;
      const created = o.createdAt ? formatDateISO(o.createdAt) : '';

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

      div.innerHTML = `
        <strong>${escapeHtml(o.name)}</strong> — ${escapeHtml(o.service)}<br/>
        <div class="meta">${escapeHtml(o.email)} • ${escapeHtml(o.phone)} • ${escapeHtml(o.address)}${created ? ' • ' + created : ''}</div>
        <div class="meta">Status: <span id="status-${o._id}">${escapeHtml(o.status || 'Naročeno')}</span></div>
      `;
      const controls = document.createElement('div');
      controls.appendChild(statusSelect);
      controls.appendChild(updateStatusBtn);
      controls.appendChild(editBtn);
      div.appendChild(controls);

      list.appendChild(div);
    });
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
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const service = document.getElementById('service').value;

  if (!name) return alert('Vnesite ime.');
  if (!email || !isValidEmail(email)) return alert('Vnesite veljaven email.');
  if (!phone || !isValidPhone(phone)) return alert('Vnesite veljavno telefonsko številko.');
  if (!address) return alert('Vnesite naslov.');

  try {
    const res = await fetch('/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, address, service })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('address').value = '';
    // server will broadcast; refresh locally too
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
  loadOrders();
});