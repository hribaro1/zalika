// articles.js
const socket = io();
socket.on('connect', () => console.log('socket connected', socket.id));
socket.on('articleCreated', () => loadArticlesCache().then(applyFilterArticles));
socket.on('articleUpdated', () => loadArticlesCache().then(applyFilterArticles));
socket.on('articleDeleted', () => loadArticlesCache().then(applyFilterArticles));

let articlesCache = [];

function escapeHtml(s){ if(!s && s !== 0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function computeFinal(price, vat){ 
  const p = Number(price) || 0; 
  const v = Number(vat) || 0; 
  return Math.round((p * (1 + v/100)) * 100) / 100; 
}

async function loadArticlesCache() {
  try {
    const res = await fetch('/api/articles');
    if (!res.ok) throw new Error('Failed to fetch articles');
    const articles = await res.json();
    articlesCache = articles; // shrani lokalno
    articlesCache.sort((a, b) => {
      const countA = a.usageCount || 0;
      const countB = b.usageCount || 0;
      // Sort by usageCount descending (largest first), then by name ascending
      if (countB !== countA) return countB - countA;
      return (a.name || '').localeCompare(b.name || '');
    });
  } catch (err) {
    console.error('Could not load articles', err);
  }
}

function renderArticles(articles) {
  const list = document.getElementById('articlesList');
  if (!articles.length) { list.innerHTML = '<i>Ni artiklov.</i>'; return; }
  list.innerHTML = '';
  articles.forEach(a => {
    const el = document.createElement('div');
    el.className = 'order';
    el.id = 'art-' + a._id;
    el.style.cursor = 'pointer';
    const textDiv = document.createElement('div');
    const usageCount = a.usageCount || 0;
    textDiv.innerHTML = `<strong>${escapeHtml(a.name)}</strong> <div class="meta">${escapeHtml(a.unit)} • ${Number(a.price).toFixed(2)} € • DDV: ${Number(a.vatPercent)}% • Končna: ${Number(a.finalPrice).toFixed(2)} € • Števec: ${usageCount}</div>`;
    el.appendChild(textDiv);
    el.addEventListener('click', () => openEdit(a));
    list.appendChild(el);
  });
}

function applyFilterArticles() {
  const q = document.getElementById('articleSearch').value.trim().toLowerCase();
  const filtered = articlesCache.filter(a =>
    (a.name && String(a.name).toLowerCase().includes(q))
  );
  renderArticles(filtered);
}

async function addArticle(){
  const name = document.getElementById('a-name').value.trim();
  const unit = document.getElementById('a-unit').value.trim();
  const price = parseFloat(document.getElementById('a-price').value);
  const vat = parseFloat(document.getElementById('a-vat').value);
  if(!name) return alert('Vnesite naziv.');
  if(!unit) return alert('Vnesite enoto mere.');
  if(isNaN(price) || price < 0) return alert('Vnesite veljavno ceno.');
  if(isNaN(vat) || vat < 0) return alert('Vnesite veljaven DDV.');
  try{
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, unit, price, vatPercent: vat })
    });
    if(!res.ok){
      const e = await res.json().catch(()=>null);
      const msg = e && e.error ? e.error : 'Server error';
      throw new Error(msg);
    }
    document.getElementById('a-name').value='';
    document.getElementById('a-unit').value='';
    document.getElementById('a-price').value='';
    document.getElementById('a-vat').value='';
    document.getElementById('a-final').textContent = '0.00 €';
    loadArticlesCache().then(applyFilterArticles);
  }catch(err){
    console.error(err);
    alert('Napaka pri dodajanju artikla: ' + (err.message || 'neznana napaka'));
  }
}

async function deleteArticle(id){
  if(!confirm('Ali želite izbrisati artikel?')) return;
  try{
    const res = await fetch('/api/articles/' + id, { method: 'DELETE' });
    if(!res.ok){ const e = await res.json().catch(()=>null); throw new Error(e && e.error ? e.error : 'Server error'); }
    loadArticlesCache().then(applyFilterArticles);
  }catch(err){ console.error(err); alert('Napaka pri brisanju artikla.'); }
}

function openEdit(a){
  const modal = document.getElementById('articleEditModal');
  modal.style.display='flex'; modal.setAttribute('aria-hidden','false');
  modal.dataset.editingId = a._id;
  document.getElementById('edit-a-name').value = a.name || '';
  document.getElementById('edit-a-unit').value = a.unit || '';
  document.getElementById('edit-a-price').value = (a.price != null) ? a.price : '';
  document.getElementById('edit-a-vat').value = (a.vatPercent != null) ? a.vatPercent : '';
  document.getElementById('edit-a-final').textContent = (a.finalPrice != null) ? a.finalPrice.toFixed(2) + ' €' : '0.00 €';
}

function closeEdit(){
  const m = document.getElementById('articleEditModal');
  m.style.display='none'; m.setAttribute('aria-hidden','true'); delete m.dataset.editingId;
}

async function saveEdit(){
  const modal = document.getElementById('articleEditModal');
  const id = modal.dataset.editingId; if(!id) return;
  const name = document.getElementById('edit-a-name').value.trim();
  const unit = document.getElementById('edit-a-unit').value.trim();
  const price = parseFloat(document.getElementById('edit-a-price').value);
  const vat = parseFloat(document.getElementById('edit-a-vat').value);
  if(!name) return alert('Vnesite naziv.');
  if(!unit) return alert('Vnesite enoto mere.');
  if(isNaN(price) || price < 0) return alert('Vnesite veljavno ceno.');
  if(isNaN(vat) || vat < 0) return alert('Vnesite veljaven DDV.');
  try{
    const res = await fetch('/api/articles/' + id, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, unit, price, vatPercent: vat })
    });
    if(!res.ok){ const e = await res.json().catch(()=>null); throw new Error(e && e.error ? e.error : 'Server error'); }
    closeEdit();
    loadArticlesCache().then(applyFilterArticles);
  }catch(err){ console.error(err); alert('Napaka pri urejanju artikla.'); }
}

/* live compute final price in add/edit forms */
function updateAddFinal(){
  const price = parseFloat(document.getElementById('a-price').value);
  const vat = parseFloat(document.getElementById('a-vat').value);
  document.getElementById('a-final').textContent = computeFinal(price, vat).toFixed(2) + ' €';
}
function updateEditFinal(){
  const price = parseFloat(document.getElementById('edit-a-price').value);
  const vat = parseFloat(document.getElementById('edit-a-vat').value);
  document.getElementById('edit-a-final').textContent = computeFinal(price, vat).toFixed(2) + ' €';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addArticleBtn').addEventListener('click', addArticle);
  document.getElementById('a-price').addEventListener('input', updateAddFinal);
  document.getElementById('a-vat').addEventListener('input', updateAddFinal);
  document.getElementById('edit-a-price').addEventListener('input', updateEditFinal);
  document.getElementById('edit-a-vat').addEventListener('input', updateEditFinal);
  document.getElementById('edit-a-cancel').addEventListener('click', (e)=>{ e.preventDefault(); closeEdit(); });
  document.getElementById('edit-a-save').addEventListener('click', (e)=>{ e.preventDefault(); saveEdit(); });
  document.getElementById('edit-a-delete').addEventListener('click', (e)=>{ e.preventDefault(); const modal = document.getElementById('articleEditModal'); deleteArticle(modal.dataset.editingId); closeEdit(); });
  const search = document.getElementById('articleSearch');
  if (search) search.addEventListener('input', applyFilterArticles);
  loadArticlesCache().then(() => renderArticles(articlesCache));
});