// articles.js
const socket = io();
socket.on('connect', () => console.log('socket connected', socket.id));
socket.on('articleCreated', () => loadArticles());
socket.on('articleUpdated', () => loadArticles());
socket.on('articleDeleted', () => loadArticles());

function escapeHtml(s){ if(!s && s !== 0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function computeFinal(price, vat){ 
  const p = Number(price) || 0; 
  const v = Number(vat) || 0; 
  return Math.round((p * (1 + v/100)) * 100) / 100; 
}

async function loadArticles(){
  const list = document.getElementById('articlesList');
  list.textContent = 'Nalaganje...';
  try{
    const res = await fetch('/api/articles');
    if(!res.ok) throw new Error('Network error');
    const articles = await res.json();
    if(!articles.length){ list.innerHTML = '<i>Ni artiklov.</i>'; return; }
    list.innerHTML = '';
    articles.forEach(a => {
      const el = document.createElement('div');
      el.className = 'order';
      el.id = 'art-' + a._id;
      el.style.display = 'flex';
      el.style.justifyContent = 'space-between';
      el.style.alignItems = 'center';
      const textDiv = document.createElement('div');
      textDiv.innerHTML = `<strong>${escapeHtml(a.name)}</strong> <div class="meta">${escapeHtml(a.unit)} • ${Number(a.price).toFixed(2)} € • DDV: ${Number(a.vatPercent)}% • Končna: ${Number(a.finalPrice).toFixed(2)} €</div>`;
      el.appendChild(textDiv);
      const actions = document.createElement('div');
      const edit = document.createElement('button'); edit.textContent = 'Uredi'; edit.className = 'small-btn';
      edit.addEventListener('click', () => openEdit(a));
      const del = document.createElement('button'); del.textContent = 'Izbriši'; del.className = 'small-btn';
      del.addEventListener('click', () => deleteArticle(a._id));
      actions.appendChild(edit); actions.appendChild(del);
      el.appendChild(actions);
      list.appendChild(el);
    });
  } catch(err){
    console.error(err);
    list.innerHTML = '<span style="color:red">Napaka pri nalaganju artiklov.</span>';
  }
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
    loadArticles();
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
    loadArticles();
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
    loadArticles();
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
  loadArticles();
});