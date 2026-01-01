const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

const { jsPDF } = window.jspdf;

/* --- socket.io client --- */
const socket = io();
socket.on('connect', () => console.log('socket connected', socket.id));
socket.on('orderCreated', (order) => {
  console.log('orderCreated', order);
  // On remote update, scroll to the newly created order but don't override local preserveScrollPosition
  loadOrders(true, order._id);
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
  doc.setFont('arial', 'normal');
  doc.setFontSize(9);
  let y = 10;
  doc.text(`St. narocila: ${order.orderNumber || ''}`, 10, y);
  y += 6;
  doc.text(`Ime: ${order.name}`, 10, y);
  y += 6;
  doc.text(`E-posta: ${order.email}`, 10, y);
  y += 6;
  doc.text(`Telefon: ${order.phone}`, 10, y);
  y += 6;
  doc.text(`Naslov: ${order.address}`, 10, y);
  y += 6;
  doc.text(`Storitev: ${order.service}`, 10, y);
  y += 6;
  doc.text(`Status: ${order.status}`, 10, y);
  y += 6;
  doc.text(`Datum: ${order.createdAt ? formatDateISO(order.createdAt) : ''}`, 10, y);
  y += 8;
  if (order.items && order.items.length) {
    doc.text('Pozicije:', 10, y);
    y += 6;
    let total = 0;
    order.items.forEach(item => {
      doc.text(`${item.name} - ${item.quantity} x ${item.finalPrice} € = ${item.lineTotal} €`, 10, y);
      total += item.lineTotal || 0;
      y += 6;
    });
    y += 6;
    doc.text(`Skupni znesek: ${total.toFixed(2)} €`, 10, y);
    y += 10;
  }
  if (order.statusHistory && order.statusHistory.length) {
    doc.text('Zgodovina statusa:', 10, y);
    y += 6;
    order.statusHistory.forEach(h => {
      doc.text(`${h.status} - ${formatDateISO(h.timestamp)}`, 10, y);
      y += 6;
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
  const container = document.createElement('div');
  container.className = 'article-select-container';
  container.style.position = 'relative';
  container.style.width = '300px';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'article-input';
  input.placeholder = 'Išči artikel...';
  const suggestions = document.createElement('div');
  suggestions.className = 'article-suggestions';
  suggestions.style.display = 'none';
  suggestions.style.position = 'absolute';
  suggestions.style.background = 'white';
  suggestions.style.border = '1px solid #ccc';
  suggestions.style.maxHeight = '200px';
  suggestions.style.overflowY = 'auto';
  suggestions.style.zIndex = '1000';
  suggestions.style.width = '100%';
  container.appendChild(input);
  container.appendChild(suggestions);
  input.addEventListener('focus', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      const filtered = articlesCache;
      suggestions.innerHTML = '';
      filtered.forEach(a => {
        const item = document.createElement('div');
        item.className = 'article-suggestion';
        item.textContent = `${a.name} — ${Number(a.finalPrice).toFixed(2)} €`;
        item.style.padding = '5px';
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
          input.value = a.name;
          container.dataset.selectedId = a._id;
          suggestions.style.display = 'none';
        });
        suggestions.appendChild(item);
      });
      suggestions.style.display = filtered.length ? 'block' : 'none';
    }
  });
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      suggestions.style.display = 'none';
      container.dataset.selectedId = '';
      return;
    }
    const filtered = articlesCache.filter(a => a.name && String(a.name).toLowerCase().includes(q));
    suggestions.innerHTML = '';
    filtered.forEach(a => {
      const item = document.createElement('div');
      item.className = 'article-suggestion';
      item.textContent = `${a.name} — ${Number(a.finalPrice).toFixed(2)} €`;
      item.style.padding = '5px';
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        input.value = a.name;
        container.dataset.selectedId = a._id;
        suggestions.style.display = 'none';
      });
      suggestions.appendChild(item);
    });
    suggestions.style.display = filtered.length ? 'block' : 'none';
  });
  input.addEventListener('blur', () => setTimeout(() => suggestions.style.display = 'none', 150));
  if (selectedId) {
    const art = articlesCache.find(a => String(a._id) === String(selectedId));
    if (art) {
      input.value = art.name;
      container.dataset.selectedId = art._id;
    }
  }
  return container;
}

function renderOrderItems(container, items, orderId) {
  container.innerHTML = '';
  if (!items || !items.length) {
    container.innerHTML = '<i>Ni pozicij.</i>';
    return;
  }
  const ul = document.createElement('div');
  ul.className = 'order-items';
  items.forEach((it, index) => {
    const row = document.createElement('div');
    row.className = 'order-item';
    row.style.cursor = 'pointer';
    row.title = 'Kliknite za urejanje pozicije';
    const qty = it.quantity || 1;
    const qtyDisplay = Number(qty) % 1 === 0 ? qty : Number(qty).toFixed(1);
    const name = it.name || '(artikel)';
    const line = (typeof it.lineTotal !== 'undefined') ? Number(it.lineTotal).toFixed(2) : ((it.finalPrice || 0) * qty).toFixed(2);
    row.innerHTML = `<div style="display: flex; justify-content: space-between;"><span><strong>${escapeHtml(name)}</strong></span><span>${qtyDisplay} × ${Number(it.finalPrice||0).toFixed(2)} € = <strong>${line} €</strong></span></div>`;
    row.addEventListener('click', () => openEditItemModal(orderId, index, it));
    ul.appendChild(row);
  });
  container.appendChild(ul);
}

async function addItemToOrder(orderId, orderEl) {
  const container = orderEl.querySelector('.article-select-container');
  const qtyIn = orderEl.querySelector('.article-qty');
  const articleId = container ? container.dataset.selectedId : '';
  const qty = Math.max(0.1, parseFloat(qtyIn ? qtyIn.value : 1) || 1);
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

async function loadOrders(preserveScrollPosition = true, scrollToOrderId = null) {
  const list = document.getElementById('ordersList');
  // Save the ID of the topmost visible order
  let topOrderId = null;
  if (preserveScrollPosition) {
    const orderDivs = list.querySelectorAll('.order');
    for (let div of orderDivs) {
      if (div.getBoundingClientRect().top >= 0) {
        topOrderId = div.id.replace('order-', '');
        break;
      }
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
      renderOrderItems(itemsContainer, currentItems, o._id);

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
      articleSel.style.marginRight = '12px';
      const qtyIn = document.createElement('input');
      qtyIn.type = 'number'; qtyIn.min = '0.1'; qtyIn.step = '0.1'; qtyIn.value = '1'; qtyIn.className = 'article-qty';
      qtyIn.style.width = '50px'; qtyIn.style.marginLeft = '8px';
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
      
      // Update status immediately when dropdown changes
      statusSelect.addEventListener('change', () => updateStatus(o._id, statusSelect.value));

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Uredi naročilo'; editBtn.className = 'small-btn';
      editBtn.addEventListener('click', () => openEditModal(o));

      const printBtn = document.createElement('button');
      printBtn.textContent = 'Izpis naročila'; printBtn.className = 'small-btn';
      printBtn.addEventListener('click', () => generateOrderPDF(o));

      div.innerHTML = `
        <strong>Št. naročila: ${escapeHtml(o.orderNumber || '')}</strong><br/>
        <strong>${escapeHtml(o.name)}</strong> — ${escapeHtml(o.service)}<br/>
        <div class="meta">${escapeHtml(o.email)} • ${escapeHtml(o.phone)} • ${escapeHtml(o.address)}${created ? ' • ' + created : ''}</div>
        <div class="meta">Status: <span id="status-${o._id}">${escapeHtml(o.status || 'Naročeno')}</span></div>
      `;

      // append items container and add form
      div.appendChild(itemsContainer);
      if (window.location.pathname !== '/archive') div.appendChild(addWrap);

      const controls = document.createElement('div');
      controls.appendChild(editBtn);
      controls.appendChild(printBtn);
      div.appendChild(controls);
      
      const statusControl = document.createElement('div');
      statusControl.style.marginTop = '8px';
      statusControl.appendChild(statusSelect);
      div.appendChild(statusControl);

      if (historyDiv) div.appendChild(historyDiv);

      list.appendChild(div);
    });
    // Scroll to the target order
    if (scrollToOrderId) {
      // Scroll to the newly created order
      setTimeout(() => {
        const targetDiv = document.getElementById('order-' + scrollToOrderId);
        if (targetDiv) {
          targetDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else if (topOrderId) {
      // Scroll to the previously topmost visible order
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

  if (!name) { alert('Ime mora biti izpolnjeno.'); return; }

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

async function deleteOrder() {
  const modal = document.getElementById('editModal');
  const id = modal.dataset.editingId;
  if (!id) return;
  
  if (!confirm('Ali ste prepričani, da želite izbrisati to naročilo?')) return;
  
  try {
    const res = await fetch(`/order/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err && err.error ? err.error : 'Server error');
    }
    closeEditModal();
    loadOrders();
  } catch (err) {
    console.error(err);
    alert('Napaka pri brisanju naročila. Preverite konzolo.');
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

  try {
    const res = await fetch('/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, address, service })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    
    // Get the new order from response
    const data = await res.json();
    const newOrderId = data.order ? data.order._id : null;
    
    // Clear all input fields after successful order
    document.getElementById('customerInput').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('address').value = '';
    document.getElementById('service').selectedIndex = 0;
    selectedCustomerId = null;
    
    // osveži seznam naročil in scrollaj na novo naročilo
    loadOrders(false, newOrderId);
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
    customersCache.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
  const max = list.length;
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
      (c.name && String(c.name).toLowerCase().includes(q))
    );
    showCustomerSuggestions(filtered);
  });

  // hide suggestions on blur (delay to allow click)
  input.addEventListener('blur', () => { setTimeout(() => { box.innerHTML = ''; box.setAttribute('aria-hidden','true'); }, 150); });

  // show all on focus if empty (optional)
  input.addEventListener('focus', () => {
    if (!input.value.trim()) {
      showCustomerSuggestions(customersCache);
    }
  });
}

/* --- Edit item modal functions --- */
function openEditItemModal(orderId, itemIndex, item) {
  const modal = document.getElementById('editItemModal');
  if (!modal) { alert('Modal za urejanje pozicije ni na voljo.'); return; }
  
  modal.setAttribute('aria-hidden', 'false');
  modal.style.display = 'flex';
  
  // Set current values
  document.getElementById('edit-item-quantity').value = item.quantity || 1;
  
  // Setup article select
  const articleContainer = document.getElementById('edit-item-article-container');
  articleContainer.innerHTML = '';
  const articleSel = createArticleSelect(item.articleId);
  articleContainer.appendChild(articleSel);
  
  // Trigger the dropdown to show when the input is ready
  setTimeout(() => {
    const input = articleSel.querySelector('.article-input');
    if (input) {
      input.focus();
      input.click();
    }
  }, 100);
  
  // Store orderId and itemIndex for saving
  modal.dataset.editingOrderId = orderId;
  modal.dataset.editingItemIndex = itemIndex;
}

function closeEditItemModal() {
  const modal = document.getElementById('editItemModal');
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
  delete modal.dataset.editingOrderId;
  delete modal.dataset.editingItemIndex;
}

async function saveEditItem() {
  const modal = document.getElementById('editItemModal');
  const orderId = modal.dataset.editingOrderId;
  const itemIndex = parseInt(modal.dataset.editingItemIndex);
  
  if (!orderId || isNaN(itemIndex)) return;
  
  const qtyInput = document.getElementById('edit-item-quantity');
  const quantity = Math.max(0.1, parseFloat(qtyInput.value) || 1);
  
  const articleContainer = document.getElementById('edit-item-article-container').querySelector('.article-select-container');
  const articleId = articleContainer ? articleContainer.dataset.selectedId : '';
  
  if (!articleId) { alert('Izberite artikel.'); return; }
  
  const art = articlesCache.find(a => String(a._id) === String(articleId));
  if (!art) { alert('Artikel ni na voljo.'); return; }
  
  // Get current order element and items
  const orderEl = document.getElementById('order-' + orderId);
  if (!orderEl) { alert('Naročilo ni najdeno.'); return; }
  
  let items = [];
  try { items = JSON.parse(orderEl.dataset.items || '[]'); } catch(e) { items = []; }
  
  // Update the item
  items[itemIndex] = {
    articleId: art._id,
    name: art.name,
    unit: art.unit,
    price: art.price,
    vatPercent: art.vatPercent,
    finalPrice: art.finalPrice,
    quantity: quantity,
    lineTotal: Math.round(art.finalPrice * quantity * 100) / 100
  };
  
  // Send update to server
  try {
    const res = await fetch(`/order/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      throw new Error(e && e.error ? e.error : 'Server error');
    }
    closeEditItemModal();
    loadOrders();
  } catch (err) {
    console.error(err);
    alert('Napaka pri posodabljanju pozicije. Preverite konzolo.');
  }
}

async function deleteEditItem() {
  const modal = document.getElementById('editItemModal');
  const orderId = modal.dataset.editingOrderId;
  const itemIndex = parseInt(modal.dataset.editingItemIndex);
  
  if (!orderId || isNaN(itemIndex)) return;
  if (!confirm('Ali ste prepričani, da želite izbrisati to pozicijo?')) return;
  
  // Get current order element and items
  const orderEl = document.getElementById('order-' + orderId);
  if (!orderEl) { alert('Naročilo ni najdeno.'); return; }
  
  let items = [];
  try { items = JSON.parse(orderEl.dataset.items || '[]'); } catch(e) { items = []; }
  
  // Remove the item
  items.splice(itemIndex, 1);
  
  // Send update to server
  try {
    const res = await fetch(`/order/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      throw new Error(e && e.error ? e.error : 'Server error');
    }
    closeEditItemModal();
    loadOrders();
  } catch (err) {
    console.error(err);
    alert('Napaka pri brisanju pozicije. Preverite konzolo.');
  }
}