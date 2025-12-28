function isValidEmail(email) { return /.+@.+\..+/.test(email); }
function isValidPhone(phone) { return /^[+\d\s\-().]{6,20}$/.test(phone); }

async function loadCustomers() {
  const list = document.getElementById('customersList');
  list.textContent = 'Nalaganje...';
  try {
    const res = await fetch('/api/customers');
    if (!res.ok) throw new Error('Network error');
    const customers = await res.json();
    if (!customers.length) { list.innerHTML = '<i>Ni še strank.</i>'; return; }
    list.innerHTML = '';
    customers.forEach(c => {
      const el = document.createElement('div'); el.className = 'customer'; el.id = 'cust-' + c._id;
      el.style.cursor = 'pointer';
      const textDiv = document.createElement('div');
      textDiv.innerHTML = `<strong>${escape(c.name)}</strong> <div class="meta">${escape(c.email)} • ${escape(c.phone)}${c.address ? ' • ' + escape(c.address) : ''}</div>`;
      el.appendChild(textDiv);
      el.addEventListener('click', () => openEdit(c));
      list.appendChild(el);
    });
  } catch (err) {
    console.error(err); list.innerHTML = '<span style="color:red">Napaka pri nalaganju strank.</span>';
  }
}

function escape(s) { if (!s && s !== 0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function addCustomer() {
  const name = document.getElementById('c-name').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const address = document.getElementById('c-address').value.trim();
  const notes = document.getElementById('c-notes').value.trim();
  if (!name) return alert('Vnesite ime.');
  if (!email || !isValidEmail(email)) return alert('Veljaven email je potreben.');
  if (!phone || !isValidPhone(phone)) return alert('Veljavna telefonska številka je potrebna.');
  try {
    const res = await fetch('/api/customers', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, email, phone, address, notes }) });
    if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e && e.error ? e.error : 'Server error'); }
    // success: refresh list (no alert)
    document.getElementById('c-name').value = '';
    document.getElementById('c-email').value = '';
    document.getElementById('c-phone').value = '';
    document.getElementById('c-address').value = '';
    document.getElementById('c-notes').value = '';
    loadCustomers();
  } catch (err) { console.error(err); alert('Napaka pri dodajanju stranke.'); }
}

async function deleteCustomer(id) {
  if (!confirm('Ali ste prepričani, da želite izbrisati to stranko?')) return;
  try {
    const res = await fetch('/api/customers/' + id, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e && e.error ? e.error : 'Server error'); }
    // success: refresh list
    loadCustomers();
  } catch (err) { console.error(err); alert('Napaka pri brisanju.'); }
}

function openEdit(c) {
  const modal = document.getElementById('custEditModal');
  modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false');
  modal.dataset.editingId = c._id;
  document.getElementById('edit-c-name').value = c.name || '';
  document.getElementById('edit-c-email').value = c.email || '';
  document.getElementById('edit-c-phone').value = c.phone || '';
  document.getElementById('edit-c-address').value = c.address || '';
  document.getElementById('edit-c-notes').value = c.notes || '';
}

function closeEdit() { const m = document.getElementById('custEditModal'); m.style.display='none'; m.setAttribute('aria-hidden','true'); delete m.dataset.editingId; }

async function saveEdit() {
  const modal = document.getElementById('custEditModal');
  const id = modal.dataset.editingId; if (!id) return;
  const name = document.getElementById('edit-c-name').value.trim();
  const email = document.getElementById('edit-c-email').value.trim();
  const phone = document.getElementById('edit-c-phone').value.trim();
  const address = document.getElementById('edit-c-address').value.trim();
  const notes = document.getElementById('edit-c-notes').value.trim();
  if (!name) return alert('Vnesite ime.');
  if (!email || !isValidEmail(email)) return alert('Veljaven email je potreben.');
  if (!phone || !isValidPhone(phone)) return alert('Veljavna telefonska številka je potrebna.');
  try {
    const res = await fetch('/api/customers/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, email, phone, address, notes }) });
    if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e && e.error ? e.error : 'Server error'); }
    // success: close modal and refresh list (no alert)
    closeEdit(); loadCustomers();
  } catch (err) { console.error(err); alert('Napaka pri posodabljanju.'); }
}

document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('addCustomerBtn');
  if (addBtn) addBtn.addEventListener('click', addCustomer);
  const cancel = document.getElementById('edit-cancel');
  const save = document.getElementById('edit-save');
  const del = document.getElementById('edit-delete');
  if (cancel) cancel.addEventListener('click', (e) => { e.preventDefault(); closeEdit(); });
  if (save) save.addEventListener('click', (e) => { e.preventDefault(); saveEdit(); });
  if (del) del.addEventListener('click', (e) => { e.preventDefault(); const modal = document.getElementById('custEditModal'); deleteCustomer(modal.dataset.editingId); closeEdit(); });
  loadCustomers();
});
