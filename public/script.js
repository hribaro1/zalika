const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];
const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Gotovina' },
  { value: 'invoice', label: 'Na račun' }
];
const CUSTOMER_TYPE_OPTIONS = [
  { value: 'physical', label: 'Fizična oseba' },
  { value: 'company', label: 'Podjetje' }
];
const PICKUP_OPTIONS = [
  { value: 'personal', label: 'Osebni prevzem' },
  { value: 'delivery', label: 'Dostava' }
];

// When an order update originates locally, remember which order to keep in view after socket refresh
let pendingOrderScrollId = null;

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
  const isPending = pendingOrderScrollId === order._id;
  if (isPending) {
    pendingOrderScrollId = null;
    // Refresh only this order to avoid full page reload
    refreshSingleOrder(order._id);
  } else {
    loadOrders(true, null);
  }
});
socket.on('orderDeleted', (data) => {
  console.log('orderDeleted', data);
  loadOrders();
});

// Print notifications
socket.on('printSuccess', (data) => {
  alert(data.message);
});
socket.on('printError', (data) => {
  alert('Napaka pri tiskanju: ' + data.error);
});
socket.on('printNotification', (data) => {
  console.log('Print notification:', data);
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
function pickupLabel(mode) {
  const m = (mode || 'personal').toLowerCase();
  if (m === 'delivery') return 'Dostava';
  return 'Osebni prevzem';
}
function paymentLabel(method) {
  const m = (method || 'cash').toLowerCase();
  return m === 'invoice' ? 'Na račun' : 'Gotovina';
}
function customerTypeLabel(t) {
  const c = (t || 'physical').toLowerCase();
  return c === 'company' ? 'Podjetje' : 'Fizična oseba';
}
function formatDateISO(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
}
function getDateKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function sendToPOSPrinter(order) {
  // Send print request via WebSocket to server, which forwards to Raspberry Pi print client
  socket.emit('printOrder', { orderId: order._id });
  console.log('Print request sent for order:', order._id);
}

/* --- main UI functions (unchanged behavior, but kept here for completeness) --- */
let articlesCache = [];
let expandedOrders = new Set();

async function loadArticlesCache() {
  try {
    const res = await fetch('/api/articles');
    if (!res.ok) throw new Error('Failed to fetch articles');
    articlesCache = await res.json();
    articlesCache.sort((a, b) => {
      const countA = a.usageCount || 0;
      const countB = b.usageCount || 0;
      // Sort by usageCount descending (largest first), then by name ascending
      if (countB !== countA) return countB - countA;
      return (a.name || '').localeCompare(b.name || '');
    });
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
  
  // Prevent clicks inside this container from propagating to parent order div
  container.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'article-input';
  input.placeholder = 'Išči artikel...';
  
  // Stop click propagation on input
  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
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
  
  // Stop click propagation on suggestions
  suggestions.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  container.appendChild(input);
  container.appendChild(suggestions);
  
  input.addEventListener('focus', (e) => {
    e.stopPropagation();
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
        // ✅ DODAJ click handler z stopPropagation
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          input.value = a.name;
          container.dataset.selectedId = a._id;
          suggestions.style.display = 'none';
        });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        suggestions.appendChild(item);
      });
      suggestions.style.display = filtered.length ? 'block' : 'none';
    }
  });
  
  input.addEventListener('input', (e) => {
    e.stopPropagation();
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
      // ✅ DODAJ click handler z stopPropagation
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.value = a.name;
        container.dataset.selectedId = a._id;
        suggestions.style.display = 'none';
      });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      suggestions.appendChild(item);
    });
    suggestions.style.display = filtered.length ? 'block' : 'none';
  });
  
  input.addEventListener('blur', (e) => {
    e.stopPropagation();
    // Increase timeout to ensure mousedown fires first
    setTimeout(() => suggestions.style.display = 'none', 200);
  });
  
  if (selectedId) {
    const art = articlesCache.find(a => String(a._id) === String(selectedId));
    if (art) {
      input.value = art.name;
      container.dataset.selectedId = art._id;
    }
  }
  return container;
}

function renderOrderItems(container, items, orderId, allowEdit = true) {
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
    if (allowEdit) {
      row.style.cursor = 'pointer';
      row.title = 'Kliknite za urejanje pozicije';
    }
    const qty = typeof it.quantity === 'number' ? it.quantity : 1;
    const qtyDisplay = Number(qty) % 1 === 0 ? qty : Number(qty).toFixed(1);
    const name = it.name || '(artikel)';
    const line = (typeof it.lineTotal !== 'undefined') ? Number(it.lineTotal).toFixed(2) : ((it.finalPrice || 0) * qty).toFixed(2);
    row.innerHTML = `<div style="display: flex; justify-content: space-between;"><span><strong>${escapeHtml(name)}</strong></span><span>${qtyDisplay} × ${Number(it.finalPrice||0).toFixed(2)} € = <strong>${line} €</strong></span></div>`;
    if (allowEdit) {
      row.addEventListener('click', () => openEditItemModal(orderId, index, it));
    }
    ul.appendChild(row);
  });
  container.appendChild(ul);
}

async function addItemToOrder(orderId, orderEl) {
  const container = orderEl.querySelector('.article-select-container');
  const qtyIn = orderEl.querySelector('.article-qty');
  const articleId = container ? container.dataset.selectedId : '';
  const qty = Math.max(0, parseFloat(qtyIn ? qtyIn.value : 1) || 0);
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

  // Ensure order stays expanded when socket update arrives - MUST be set BEFORE the fetch
  expandedOrders.add(orderId);
  pendingOrderScrollId = orderId;

  // send update to server
  try {
    const res = await fetch(`/order/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) { const e = await res.json().catch(()=>null); throw new Error(e && e.error ? e.error : 'Server error'); }
    // Socket update will handle the refresh
  } catch (err) {
    console.error(err);
    alert('Napaka pri dodajanju pozicije. Preverite konzolo.');
  }
}

async function refreshSingleOrder(orderId) {
  try {
    // Fetch only this order
    const res = await fetch(`/order/${orderId}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    const order = await res.json();
    
    // Find the existing div
    const existingDiv = document.getElementById('order-' + orderId);
    if (!existingDiv) {
      // If div doesn't exist, do full refresh
      loadOrders(true, orderId);
      return;
    }
    
    // Get parent list
    const list = existingDiv.parentElement;
    
    // Create new order div
    const tempContainer = document.createElement('div');
    renderOrdersGroup([order], tempContainer);
    const newDiv = tempContainer.firstChild;
    
    // Replace old div with new div
    if (newDiv) {
      list.replaceChild(newDiv, existingDiv);
    }
  } catch (err) {
    console.error('Failed to refresh single order:', err);
    // Fallback to full refresh
    loadOrders(true, orderId);
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

    let url = '/orders';
    if (window.location.pathname === '/archive') url = '/api/archive';
    else if (window.location.pathname === '/completed') url = '/api/completed';
    else if (window.location.pathname === '/delivery') url = '/api/delivery';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const orders = await res.json();
    if (!orders.length) { list.innerHTML = '<i>Ni še nobenih naročil.</i>'; return; }
    list.innerHTML = '';

    const isGroupedView = window.location.pathname === '/completed' || window.location.pathname === '/archive';
    const isDeliveryView = window.location.pathname === '/delivery';

    if (isDeliveryView) {
      // Split delivery orders into active and delivered
      const activeOrders = orders.filter(o => o.status !== 'Oddano');
      const deliveredOrders = orders.filter(o => o.status === 'Oddano');

      // Render active orders
      if (activeOrders.length > 0) {
        renderOrdersGroup(activeOrders, list);
      } else {
        list.innerHTML = '<i>Ni aktivnih naročil za dostavo.</i>';
      }

      // Render delivered orders grouped by date
      const deliveredList = document.getElementById('deliveredOrdersList');
      if (deliveredList) {
        deliveredList.innerHTML = '';
        
        if (deliveredOrders.length > 0) {
          // Group by date
          const ordersByDate = {};
          deliveredOrders.forEach(o => {
            let statusDate = o.createdAt;
            if (o.statusHistory && o.statusHistory.length > 0) {
              const statusEntry = o.statusHistory.slice().reverse().find(h => h.status === 'Oddano');
              if (statusEntry && statusEntry.timestamp) {
                statusDate = statusEntry.timestamp;
              }
            }
            const dateKey = getDateKey(statusDate);
            if (!ordersByDate[dateKey]) {
              ordersByDate[dateKey] = [];
            }
            ordersByDate[dateKey].push(o);
          });

          // Render each date group
          const sortedDates = Object.keys(ordersByDate).sort().reverse();
          for (const dateKey of sortedDates) {
            const dateOrders = ordersByDate[dateKey];
            
            // Calculate totals by payment method
            let cashTotal = 0;
            let invoiceTotal = 0;
            dateOrders.forEach(o => {
              const items = o.items || [];
              const orderTotal = items.reduce((s, item) => s + (item.lineTotal || 0), 0);
              if (o.paymentMethod === 'cash') {
                cashTotal += orderTotal;
              } else {
                invoiceTotal += orderTotal;
              }
            });
            const dateTotal = cashTotal + invoiceTotal;
            
            const dateHeader = document.createElement('div');
            dateHeader.className = 'date-group-header';
            dateHeader.style.flexWrap = 'wrap';
            
            const displayDate = dateOrders[0].statusHistory && dateOrders[0].statusHistory.length > 0 
              ? dateOrders[0].statusHistory[dateOrders[0].statusHistory.length - 1].timestamp 
              : dateOrders[0].createdAt;
            
            // First row: Date and totals
            const firstRow = document.createElement('div');
            firstRow.style.display = 'flex';
            firstRow.style.justifyContent = 'space-between';
            firstRow.style.alignItems = 'center';
            firstRow.style.width = '100%';
            firstRow.innerHTML = `
              <strong>${formatDateOnly(displayDate)}</strong>
              <span class="date-total">Gotovina: ${cashTotal.toFixed(2)} € | Račun: ${invoiceTotal.toFixed(2)} € | Skupaj: ${dateTotal.toFixed(2)} €</span>
            `;
            dateHeader.appendChild(firstRow);
            
            // Second row: km and minutes inputs (left aligned)
            const secondRow = document.createElement('div');
            secondRow.style.display = 'flex';
            secondRow.style.alignItems = 'center';
            secondRow.style.gap = '16px';
            secondRow.style.width = '100%';
            secondRow.style.marginTop = '8px';
            
            // Km input section
            const kmSection = document.createElement('span');
            kmSection.style.display = 'flex';
            kmSection.style.alignItems = 'center';
            kmSection.style.gap = '8px';
            
            const kmLabel = document.createElement('label');
            kmLabel.textContent = 'Kilometri: ';
            kmLabel.style.fontWeight = 'normal';
            kmLabel.style.fontSize = '14px';
            
            const kmInput = document.createElement('input');
            kmInput.type = 'number';
            kmInput.min = '0';
            kmInput.step = '0.1';
            kmInput.placeholder = 'km';
            kmInput.style.width = '70px';
            kmInput.style.padding = '4px';
            kmInput.className = 'delivery-km-input';
            kmInput.dataset.date = dateKey;
            
            kmSection.appendChild(kmLabel);
            kmSection.appendChild(kmInput);
            
            // Minutes input section
            const minutesSection = document.createElement('span');
            minutesSection.style.display = 'flex';
            minutesSection.style.alignItems = 'center';
            minutesSection.style.gap = '8px';
            
            const minutesLabel = document.createElement('label');
            minutesLabel.textContent = 'Minute: ';
            minutesLabel.style.fontWeight = 'normal';
            minutesLabel.style.fontSize = '14px';
            
            const minutesInput = document.createElement('input');
            minutesInput.type = 'number';
            minutesInput.min = '0';
            minutesInput.step = '1';
            minutesInput.placeholder = 'min';
            minutesInput.style.width = '70px';
            minutesInput.style.padding = '4px';
            minutesInput.className = 'delivery-minutes-input';
            minutesInput.dataset.date = dateKey;
            
            minutesSection.appendChild(minutesLabel);
            minutesSection.appendChild(minutesInput);
            
            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Shrani';
            saveBtn.className = 'small-btn';
            saveBtn.style.fontSize = '12px';
            saveBtn.addEventListener('click', async () => {
              const km = parseFloat(kmInput.value) || 0;
              const minutes = parseInt(minutesInput.value) || 0;
              const orderIds = dateOrders.map(o => o._id);
              
              try {
                const res = await fetch('/api/delivery-day', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ date: dateKey, kilometers: km, minutes: minutes, orderIds })
                });
                if (!res.ok) throw new Error('Failed to save');
                alert('Podatki shranjeni');
              } catch (err) {
                console.error(err);
                alert('Napaka pri shranjevanju');
              }
            });
            
            secondRow.appendChild(kmSection);
            secondRow.appendChild(minutesSection);
            secondRow.appendChild(saveBtn);
            dateHeader.appendChild(secondRow);
            
            deliveredList.appendChild(dateHeader);
            
            // Load existing delivery day data
            fetch(`/api/delivery-day/${dateKey}`)
              .then(res => res.json())
              .then(data => {
                kmInput.value = data.kilometers || '';
                minutesInput.value = data.minutes || '';
              })
              .catch(err => console.error('Failed to load delivery day data:', err));

            renderOrdersGroup(dateOrders, deliveredList);
          }
        } else {
          deliveredList.innerHTML = '<i>Ni še oddanih naročil.</i>';
        }
      }
    } else if (isGroupedView) {
      // Group orders by date when status changed to current status (Končano or Oddano)
      const ordersByDate = {};
      orders.forEach(o => {
        let statusDate = o.createdAt;
        if (o.statusHistory && o.statusHistory.length > 0) {
          // Find the last entry with the current status
          const statusEntry = o.statusHistory.slice().reverse().find(h => h.status === o.status);
          if (statusEntry && statusEntry.timestamp) {
            statusDate = statusEntry.timestamp;
          }
        }
        const dateKey = getDateKey(statusDate);
        if (!ordersByDate[dateKey]) {
          ordersByDate[dateKey] = [];
        }
        ordersByDate[dateKey].push(o);
      });

      // Render each date group
      Object.keys(ordersByDate).sort().reverse().forEach(dateKey => {
        const dateOrders = ordersByDate[dateKey];
        const dateTotal = dateOrders.reduce((sum, o) => {
          const items = o.items || [];
          return sum + items.reduce((s, item) => s + (item.lineTotal || 0), 0);
        }, 0);
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-group-header';
        const displayDate = dateOrders[0].statusHistory && dateOrders[0].statusHistory.length > 0 
          ? dateOrders[0].statusHistory[dateOrders[0].statusHistory.length - 1].timestamp 
          : dateOrders[0].createdAt;
        dateHeader.innerHTML = `
          <strong>${formatDateOnly(displayDate)}</strong>
          <span class="date-total">${dateTotal > 0 ? 'Dnevni znesek: ' + dateTotal.toFixed(2) + ' €' : ''}</span>
        `;
        list.appendChild(dateHeader);

        renderOrdersGroup(dateOrders, list);
      });
    } else {
      renderOrdersGroup(orders, list);
    }

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

function renderOrdersGroup(orders, list) {
  orders.forEach(o => {
    const div = document.createElement('div');
      div.className = 'order ' + statusToClass(o.status);
      div.id = 'order-' + o._id;
      const created = o.createdAt ? formatDateISO(o.createdAt) : '';
      const currentItems = o.items || [];
      const totalAmount = currentItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);

      // Render compact if order is not in expandedOrders Set
      if (!expandedOrders.has(o._id)) {
        div.classList.add('order-compact');
        
        // Apply light gray background for Oddano orders in completed section
        if (o.status === 'Oddano' && window.location.pathname === '/completed') {
          div.classList.add('oddano-completed');
        }
        
        div.innerHTML = `
          <strong>Št. naročila: ${escapeHtml(o.orderNumber || '')}</strong>
          <span>${escapeHtml(o.name || '')}${o.service ? ' — ' + escapeHtml(o.service) : ''}</span><br/>
          <span>${pickupLabel(o.pickupMode)}</span><br/>
          ${totalAmount > 0 ? `<span><strong>${totalAmount.toFixed(2)} €</strong></span>` : ''}
        `;
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => {
          expandedOrders.add(o._id);
          loadOrders(true, o._id);
        });
        list.appendChild(div);
        return;
      }

      // Prepare items container and dataset
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'items-container';
      div.dataset.items = JSON.stringify(currentItems);

      // Check if we're in delivery view - disable editing
      const isDeliveryView = window.location.pathname === '/delivery';

      // Render existing items (disable editing in delivery view)
      renderOrderItems(itemsContainer, currentItems, o._id, !isDeliveryView);

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
      if (o.statusHistory && o.statusHistory.length > 0) {
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

      // Add item form (only if not in delivery view)
      let addWrap = null;
      if (!isDeliveryView) {
        addWrap = document.createElement('div');
        addWrap.className = 'add-item-wrap';

        // ✅ Prevent entire add-item section from triggering parent click
        addWrap.addEventListener('click', (e) => {
          e.stopPropagation();
        });

        const articleSel = createArticleSelect();
        articleSel.style.marginTop = '8px';
        articleSel.style.marginRight = '12px';
        const qtyIn = document.createElement('input');
        qtyIn.type = 'number'; qtyIn.min = '0'; qtyIn.step = '0.1'; qtyIn.value = '1'; qtyIn.className = 'article-qty';
        qtyIn.style.width = '50px'; qtyIn.style.marginLeft = '8px';

        // ✅ Prevent quantity input clicks from propagating
        qtyIn.addEventListener('click', (e) => {
          e.stopPropagation();
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'small-btn'; addBtn.textContent = 'Dodaj pozicijo';
        addBtn.style.marginLeft = '8px';
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          addItemToOrder(o._id, div);
        });
        addWrap.appendChild(articleSel); addWrap.appendChild(qtyIn); addWrap.appendChild(addBtn);
      }

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
      printBtn.textContent = 'Natisni'; printBtn.className = 'small-btn';
      printBtn.addEventListener('click', () => sendToPOSPrinter(o));

      // Apply light gray background for Oddano orders in completed section
      if (o.status === 'Oddano' && window.location.pathname === '/completed') {
        div.style.backgroundColor = '#f5f5f5';
      }

      div.innerHTML = `
        <strong>Št. naročila: ${escapeHtml(o.orderNumber || '')}</strong><br/>
        <strong>${escapeHtml(o.name)}</strong> — ${escapeHtml(o.service)}<br/>
        <div class="meta">${escapeHtml(o.email)} • ${escapeHtml(o.phone)} • ${escapeHtml(o.address)}</div>
        <div class="meta">Status: <span id="status-${o._id}">${escapeHtml(o.status || 'Naročeno')}</span></div>
        <div class="meta">Način plačila: ${paymentLabel(o.paymentMethod)}</div>
        <div class="meta">Tip stranke: ${customerTypeLabel(o.customerType)}</div>
        ${o.orderNotes ? `<div class="meta">Opombe naročila: ${escapeHtml(o.orderNotes)}</div>` : ''}
      `;

      // append items container and add form
      div.appendChild(itemsContainer);
      if (addWrap && window.location.pathname !== '/archive' && window.location.pathname !== '/completed') {
        div.appendChild(addWrap);
      }

      // For delivery view, create simplified controls
      if (isDeliveryView) {
        const deliveryControls = document.createElement('div');
        deliveryControls.style.marginTop = '12px';
        deliveryControls.style.padding = '12px';
        deliveryControls.style.backgroundColor = '#f9f9f9';
        deliveryControls.style.borderRadius = '4px';

        // Status select
        const statusLabel = document.createElement('label');
        statusLabel.textContent = 'Status: ';
        statusLabel.style.fontWeight = 'bold';
        statusLabel.style.marginRight = '8px';
        
        const statusRow = document.createElement('div');
        statusRow.style.marginBottom = '12px';
        statusRow.appendChild(statusLabel);
        statusRow.appendChild(statusSelect);
        deliveryControls.appendChild(statusRow);

        // Payment method select
        const paymentLabel = document.createElement('label');
        paymentLabel.textContent = 'Način plačila: ';
        paymentLabel.style.fontWeight = 'bold';
        paymentLabel.style.marginRight = '8px';
        
        const paymentSelect = document.createElement('select');
        paymentSelect.className = 'payment-select';
        paymentSelect.style.marginBottom = '8px';
        PAYMENT_OPTIONS.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.value;
          opt.textContent = p.label;
          if (o.paymentMethod === p.value) opt.selected = true;
          paymentSelect.appendChild(opt);
        });
        
        paymentSelect.addEventListener('change', async () => {
          try {
            const res = await fetch(`/order/${o._id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentMethod: paymentSelect.value })
            });
            if (!res.ok) throw new Error('Failed to update payment method');
            alert('Način plačila posodobljen');
          } catch (err) {
            console.error(err);
            alert('Napaka pri posodabljanju načina plačila');
          }
        });

        const paymentRow = document.createElement('div');
        paymentRow.style.marginBottom = '12px';
        paymentRow.appendChild(paymentLabel);
        paymentRow.appendChild(paymentSelect);
        deliveryControls.appendChild(paymentRow);

        // Order notes textarea
        const notesLabel = document.createElement('label');
        notesLabel.textContent = 'Opombe: ';
        notesLabel.style.fontWeight = 'bold';
        notesLabel.style.display = 'block';
        notesLabel.style.marginBottom = '4px';

        const notesTextarea = document.createElement('textarea');
        notesTextarea.className = 'order-notes-textarea';
        notesTextarea.value = o.orderNotes || '';
        notesTextarea.placeholder = 'Vnesite opombe...';
        notesTextarea.style.width = '100%';
        notesTextarea.style.minHeight = '60px';
        notesTextarea.style.marginBottom = '8px';
        notesTextarea.style.padding = '8px';
        notesTextarea.style.borderRadius = '4px';
        notesTextarea.style.border = '1px solid #ccc';
        notesTextarea.style.fontFamily = 'inherit';
        notesTextarea.style.fontSize = '14px';

        const saveNotesBtn = document.createElement('button');
        saveNotesBtn.textContent = 'Shrani opombe';
        saveNotesBtn.className = 'small-btn';
        saveNotesBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const res = await fetch(`/order/${o._id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderNotes: notesTextarea.value })
            });
            if (!res.ok) throw new Error('Failed to update notes');
            alert('Opombe shranjene');
          } catch (err) {
            console.error(err);
            alert('Napaka pri shranjevanju opomb');
          }
        });

        const notesRow = document.createElement('div');
        notesRow.appendChild(notesLabel);
        notesRow.appendChild(notesTextarea);
        notesRow.appendChild(saveNotesBtn);
        deliveryControls.appendChild(notesRow);

        div.appendChild(deliveryControls);

        // Print button
        const printRow = document.createElement('div');
        printRow.style.marginTop = '8px';
        printRow.appendChild(printBtn);
        div.appendChild(printRow);
      } else {
        // Standard controls for other views
        const statusControl = document.createElement('div');
        statusControl.style.marginTop = '8px';
        statusControl.style.display = 'flex';
        statusControl.style.gap = '8px';
        statusControl.style.alignItems = 'center';
        statusControl.style.justifyContent = 'flex-start';
        statusControl.appendChild(statusSelect);
        div.appendChild(statusControl);

        const controls = document.createElement('div');
        if (window.location.pathname !== '/archive' && window.location.pathname !== '/completed') {
          controls.appendChild(editBtn);
        }
        controls.appendChild(printBtn);
        div.appendChild(controls);
      }

      if (historyDiv) div.appendChild(historyDiv);

      // Add click handler to toggle individual order state
      div.style.cursor = 'pointer';
      div.addEventListener('click', (e) => {
        // Don't toggle when clicking on interactive elements
        const clickedInteractive = 
          e.target.tagName === 'BUTTON' ||
          e.target.tagName === 'SELECT' ||
          e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.classList.contains('article-input') ||
          e.target.classList.contains('article-suggestion') ||
          e.target.closest('.article-select-container') ||
          e.target.closest('.article-suggestions') ||
          e.target.closest('.add-item-wrap') ||
          e.target.closest('.items-container') ||
          e.target.closest('.status-select') ||
          e.target.classList.contains('small-btn') ||
          e.target.closest('.order-item') ||
          e.target.closest('.order-notes-textarea');
        
        if (!clickedInteractive) {
          expandedOrders.delete(o._id);
          loadOrders(true, o._id);
        }
      });

      list.appendChild(div);
    });
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`/order/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    const data = await res.json();
    // Ensure the next socket refresh keeps the updated order anchored in view
    pendingOrderScrollId = id;
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

async function updateOrderMeta(id, fields) {
  try {
    const res = await fetch(`/order/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields)
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    pendingOrderScrollId = id;
    // Soft refresh for immediate feedback; socket broadcast will also reload
    loadOrders(true, id);
  } catch (err) {
    console.error(err);
    alert('Napaka pri posodabljanju podatkov naročila: ' + (err && err.message ? err.message : 'Neznana napaka'));
  }
}

/* Modal editing functions (same as previous implementation). Keep them here or import if you separated files. */
function openEditModal(order) {
  const modal = document.getElementById('editModal');
  if (!modal) { alert('Modal ni na voljo.'); return; }
  modal.setAttribute('aria-hidden', 'false'); modal.style.display = 'flex';
  document.getElementById('edit-name').value = order.name || '';
  const srv = document.getElementById('edit-service');
  for (let i=0;i<srv.options.length;i++) { if (srv.options[i].value === order.service) { srv.selectedIndex = i; break; } }
  const stat = document.getElementById('edit-status');
  stat.innerHTML = '';
  STATUS_OPTIONS.forEach(s => {
    const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
    if (order.status === s) opt.selected = true;
    stat.appendChild(opt);
  });
  const pickupSel = document.getElementById('edit-pickup');
  if (pickupSel) pickupSel.value = order.pickupMode || 'personal';
  const paySel = document.getElementById('edit-payment');
  if (paySel) paySel.value = order.paymentMethod || 'cash';
  const typeSel = document.getElementById('edit-customer-type');
  if (typeSel) typeSel.value = order.customerType || 'physical';
  const notesSel = document.getElementById('edit-order-notes');
  if (notesSel) notesSel.value = order.orderNotes || '';
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
  const service = document.getElementById('edit-service').value;
  const pickupMode = document.getElementById('edit-pickup') ? document.getElementById('edit-pickup').value : 'personal';
  const status = document.getElementById('edit-status').value;
  const paymentMethod = document.getElementById('edit-payment') ? document.getElementById('edit-payment').value : 'cash';
  const customerType = document.getElementById('edit-customer-type') ? document.getElementById('edit-customer-type').value : 'physical';
  const orderNotes = document.getElementById('edit-order-notes') ? document.getElementById('edit-order-notes').value.trim() : '';

  if (!name) { alert('Ime mora biti izpolnjeno.'); return; }

  try {
    const res = await fetch(`/order/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, service, pickupMode, status, paymentMethod, customerType, orderNotes })
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
  let customer = selectedCustomerId ? customersCache.find(c => c._id === selectedCustomerId) : null;

  // If no existing customer is selected, ask to create one from entered data
  if (!customer) {
    const nameInput = document.getElementById('customerInput').value.trim();
    const emailInput = (document.getElementById('email').value || '').trim();
    const phoneInput = (document.getElementById('phone').value || '').trim();
    const addressInput = (document.getElementById('address').value || '').trim();
    if (!nameInput) { alert('Vnesite ime stranke ali izberite iz predlog.'); return; }

    const confirmCreate = confirm('Stranka ni v bazi. Ali jo želite dodati in nadaljevati z naročilom?');
    if (!confirmCreate) return;

    try {
      const pickupModeSel = document.getElementById('pickupMode');
      const pickupMode = pickupModeSel ? pickupModeSel.value : 'personal';
      const resCust = await fetch('/api/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput,
          email: emailInput,
          phone: phoneInput,
          address: addressInput,
          paymentMethod: selectedCustomerPaymentMethod || 'cash',
          type: selectedCustomerType || 'physical',
          pickupMode: pickupMode
        })
      });
      if (!resCust.ok) { const err = await resCust.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Napaka pri shranjevanju stranke'); }
      const created = await resCust.json();
      customer = created.customer;
      if (customer && customer._id) {
        customersCache.push(customer);
        customersCache.sort((a, b) => {
          const countA = a.usageCount || 0;
          const countB = b.usageCount || 0;
          if (countB !== countA) return countB - countA;
          return (a.name || '').localeCompare(b.name || '');
        });
        selectedCustomerId = customer._id;
        selectedCustomerPaymentMethod = customer.paymentMethod || selectedCustomerPaymentMethod;
        selectedCustomerType = customer.type || selectedCustomerType;
      }
    } catch (err) {
      console.error(err);
      alert('Napaka pri ustvarjanju nove stranke: ' + (err && err.message ? err.message : 'Neznana napaka'));
      return;
    }
  }

  const name = customer.name;
  const email = customer.email || '';
  const phone = customer.phone || '';
  const address = customer.address || '';
  const service = document.getElementById('service').value;
  const pickupModeSel = document.getElementById('pickupMode');
  const pickupMode = pickupModeSel ? pickupModeSel.value : 'personal';
  const paymentMethod = customer.paymentMethod || selectedCustomerPaymentMethod || 'cash';
  const customerType = customer.type || selectedCustomerType || 'physical';

  try {
    const res = await fetch('/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer._id, name, email, phone, address, service, pickupMode, paymentMethod, customerType })
    });
    if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err && err.error ? err.error : 'Server error'); }
    
    // Get the new order from response
    const data = await res.json();
    const newOrderId = data.order ? data.order._id : null;
    
    // Add new order to expanded set so it stays open
    if (newOrderId) {
      expandedOrders.add(newOrderId);
    }
    
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

  const compactBtn = document.getElementById('ordersCompact');
  const expandBtn = document.getElementById('ordersExpanded');
  
  if (compactBtn) compactBtn.addEventListener('click', () => { 
    expandedOrders.clear(); 
    loadOrders(false); 
  });
  if (expandBtn) expandBtn.addEventListener('click', async () => { 
    // Get all current order IDs
    const list = document.getElementById('ordersList');
    if (list) {
      const orderDivs = list.querySelectorAll('.order');
      orderDivs.forEach(div => {
        const orderId = div.id.replace('order-', '');
        if (orderId) expandedOrders.add(orderId);
      });
    }
    loadOrders(false); 
  });

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
let selectedCustomerPaymentMethod = 'cash';
let selectedCustomerType = 'physical';

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers');
    if (!res.ok) throw new Error('Failed to fetch customers');
    const customers = await res.json();
    customersCache = customers; // shrani lokalno
    customersCache.sort((a, b) => {
      const countA = a.usageCount || 0;
      const countB = b.usageCount || 0;
      // Sort by usageCount descending (largest first), then by name ascending
      if (countB !== countA) return countB - countA;
      return (a.name || '').localeCompare(b.name || '');
    });
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
  // store defaults for new order submission
  selectedCustomerPaymentMethod = c.paymentMethod || 'cash';
  selectedCustomerType = c.type || 'physical';
  // Set pickupMode from customer default
  const pickupModeSel = document.getElementById('pickupMode');
  if (pickupModeSel && c.pickupMode) {
    pickupModeSel.value = c.pickupMode;
  }
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
  if (!modal) { alert('Urejanje pozicij je možno le v meniju aktivnih naročil.'); return; }
  
  modal.setAttribute('aria-hidden', 'false');
  modal.style.display = 'flex';
  
  // Set current values
  document.getElementById('edit-item-quantity').value = typeof item.quantity === 'number' ? item.quantity : 1;
  
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
  const quantity = Math.max(0, parseFloat(qtyInput.value) || 0);
  
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
  
  // Set state BEFORE sending request to prevent race condition
  expandedOrders.add(orderId);
  pendingOrderScrollId = orderId;

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
    // Socket update will handle the refresh
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
  
  // Set state BEFORE sending request to prevent race condition
  expandedOrders.add(orderId);
  pendingOrderScrollId = orderId;

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
    // Socket update will handle the refresh
  } catch (err) {
    console.error(err);
    alert('Napaka pri brisanju pozicije. Preverite konzolo.');
  }
}