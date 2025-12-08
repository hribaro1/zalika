const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

function isValidEmail(email) {
  return /.+@.+\..+/.test(email);
}
function isValidPhone(phone) {
  return /^[+\d\s\-().]{6,20}$/.test(phone);
}
function statusToClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'naročeno':
    case 'naroceno': return 's-naroceno';
    case 'sprejeto': return 's-sprejeto';
    case 'v delu':
    case 'v-delu': return 's-v-delu';
    case 'končano':
    case 'koncano': return 's-koncano';
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadOrders() {
  const list = document.getElementById('ordersList');
  list.textContent = 'Nalaganje...';
  try {
    const res = await fetch('/orders');
    if (!res.ok) throw new Error('Network response not ok');
    const orders = await res.json();
    if (!orders.length) {
      list.innerHTML = '<i>Ni še nobenih naročil.</i>';
      return;
    }
    list.innerHTML = '';
    orders.forEach(o => {
      const div = document.createElement('div');
      div.className = 'order ' + statusToClass(o.status);
      div.id = 'order-' + o._id;
      const created = o.createdAt ? formatDateISO(o.createdAt) : '';

      const statusSelect = document.createElement('select');
      statusSelect.className = 'status-select';
      STATUS_OPTIONS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (o.status === s) opt.selected = true;
        statusSelect.appendChild(opt);
      });

      const updateStatusBtn = document.createElement('button');
      updateStatusBtn.textContent = 'Posodobi status';
      updateStatusBtn.className = 'small-btn';
      updateStatusBtn.addEventListener('click', () => updateStatus(o._id, statusSelect.value));

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Uredi';
      editBtn.className = 'small-btn';
      editBtn.addEventListener('click', () => editOrder(o));

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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err && err.error ? err.error : 'Server error');
    }
    const data = await res.json();
    document.getElementById(`status-${id}`).textContent = data.order.status;
    const orderEl = document.getElementById('order-' + id);
    if (orderEl) orderEl.className = 'order ' + statusToClass(data.order.status);
    alert('Status posodobljen.');
  } catch (err) {
    console.error(err);
    alert('Napaka pri posodabljanju statusa. Preverite konzolo.');
  }
}

async function editOrder(order) {
  const name = prompt('Ime:', order.name) || order.name;
  const email = prompt('Email:', order.email) || order.email;
  const phone = prompt('Telefon:', order.phone) || order.phone;
  const address = prompt('Naslov:', order.address) || order.address;
  const service = prompt('Storitev:', order.service) || order.service;
  const status = prompt('Status (točno ime):', order.status) || order.status;

  if (!name || !email || !address || !phone) {
    alert('Ime, email, telefon in naslov morajo biti izpolnjeni.');
    return;
  }
  if (!/.+@.+\..+/.test(email)) {
    alert('Neveljaven email.');
    return;
  }
  if (!/^[+\d\s\-().]{6,20}$/.test(phone)) {
    alert('Neveljavna telefonska številka.');
    return;
  }
  if (!STATUS_OPTIONS.includes(status)) {
    alert('Neveljaven status. Dovoljeni so: ' + STATUS_OPTIONS.join(', '));
    return;
  }

  try {
    const res = await fetch(`/order/${order._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, address, service, status })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err && err.error ? err.error : 'Server error');
    }
    alert('Naročilo posodobljeno.');
    loadOrders();
  } catch (err) {
    console.error(err);
    alert('Napaka pri posodabljanju naročila. Preverite konzolo.');
  }
}

async function order() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const service = document.getElementById("service").value;

  if (!name) return alert("Vnesite ime.");
  if (!email || !isValidEmail(email)) return alert("Vnesite veljaven email.");
  if (!phone || !isValidPhone(phone)) return alert("Vnesite veljavno telefonsko številko.");
  if (!address) return alert("Vnesite naslov.");

  try {
    const res = await fetch("/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, address, service })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err && err.error ? err.error : 'Server error');
    }
    const data = await res.json();
    alert('Naročilo sprejeto!');
    document.getElementById("name").value = '';
    document.getElementById("email").value = '';
    document.getElementById("phone").value = '';
    document.getElementById("address").value = '';
    loadOrders();
  } catch (err) {
    console.error(err);
    alert("Napaka pri oddaji naročila. Preverite konzolo.");
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("placeOrder").addEventListener("click", order);
  loadOrders();
});