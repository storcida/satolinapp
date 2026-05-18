// ============================================
// SATOLINA COMPRAS — App Logic v2.0.0
// Supabase SDK v2 · PKCE · Offline-First
// ============================================
// sb is set in Auth.onReady (see boot block at bottom)
let sb = null;

let USER = null, ROLE = '', MODULE = 'super';
let CUR_LISTA = null, CUR_ITEMS = [];
let ALL_CATS = [], WEATHER_DATA = null, IS_DARK = true;
let SEARCH_TO = null, SEL_IDX = 0, S_RES = [], FIN_RATING = 0;
let PROD_PHOTOS = {}, SCANNER_CTX = null, _scanner = null;
let BOOT_DONE = false;

const FMT = n => new Intl.NumberFormat('es-PY').format(n || 0);
const UID = () => crypto.randomUUID().substring(0, 12);
const NORM = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtD = d => { try { return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) } catch { return '' } };

// ══════════════════════════════════════════
// OFFLINE QUEUE (IndexedDB)
// ══════════════════════════════════════════
const DB_NAME = 'satolina_offline';
const DB_VER = 1;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(op) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add({ ...op, ts: Date.now() });
    tx.oncomplete = () => { updateOfflineBadge(); res(); };
    tx.onerror = () => rej(tx.error);
  });
}
async function getQueue() {
  const db = await openDB();
  return new Promise((res) => {
    const tx = db.transaction('queue', 'readonly');
    const r = tx.objectStore('queue').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => res([]);
  });
}
async function dequeue(qid) {
  const db = await openDB();
  return new Promise((res) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(qid);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

async function cacheSet(key, value) {
  try {
    const db = await openDB();
    return new Promise(res => {
      const tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').put({ key, value, ts: Date.now() });
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch { /* ignore */ }
}
async function cacheGet(key) {
  try {
    const db = await openDB();
    return new Promise(res => {
      const tx = db.transaction('cache', 'readonly');
      const r = tx.objectStore('cache').get(key);
      r.onsuccess = () => res(r.result?.value ?? null);
      r.onerror = () => res(null);
    });
  } catch { return null; }
}

// ── Sync engine ──
let SYNCING = false;
async function syncQueue() {
  if (SYNCING || !navigator.onLine) return;
  const ops = await getQueue();
  if (!ops.length) return;
  SYNCING = true;
  updateOfflineBadge();
  let synced = 0, failed = 0;
  for (const op of ops) {
    try {
      await executeOp(op);
      await dequeue(op.qid);
      synced++;
    } catch (e) {
      const msg = e.message || '';
      console.warn('[Sync] Failed op:', op.action, op.data || op.id, '→', msg, e.code || '');

      // Schema errors (columna inexistente, tabla no encontrada): la op es irrecuperable → descartar
      if (msg.includes('PGRST204') || msg.includes('column') || msg.includes('schema cache')) {
        console.warn('[Sync] Operación obsoleta, descartando:', op.action);
        await dequeue(op.qid);
        synced++; // contar como procesada
        continue;
      }

      failed++;
      if (msg.includes('401') || msg.includes('JWT')) break;
    }
  }
  SYNCING = false;
  updateOfflineBadge();
  if (synced > 0) {
    flash(`☁️ ${synced} cambio${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}`, 'ok');
    if (CUR_LISTA) openLista(CUR_LISTA.id); else showHome();
  }
  if (failed > 0) flash(`⚠️ ${failed} pendiente${failed > 1 ? 's' : ''} no sincronizado${failed > 1 ? 's' : ''}`, 'err');
}

async function executeOp(op) {
  let res;
  switch (op.action) {
    case 'insert_item':
      res = await sb.from('lista_items').insert(op.data);
      if (res.error) throw res.error; break;
    case 'update_item':
      res = await sb.from('lista_items').update(op.data).eq('id', op.id);
      if (res.error) throw res.error; break;
    case 'delete_item':
      res = await sb.from('lista_items').delete().eq('id', op.id);
      if (res.error) throw res.error; break;
    case 'insert_lista':
      res = await sb.from('listas').insert(op.data);
      if (res.error) throw res.error; break;
    case 'update_lista':
      res = await sb.from('listas').update(op.data).eq('id', op.id);
      if (res.error) throw res.error; break;
    case 'delete_lista':
      res = await sb.from('listas').delete().eq('id', op.id);
      if (res.error) throw res.error; break;
    case 'delete_items_by_lista':
      res = await sb.from('lista_items').delete().eq('lista_id', op.lista_id);
      if (res.error) throw res.error; break;
    case 'insert_historial':
      await sb.from('historial').insert(op.data).catch(() => {}); break;
    case 'increment_product':
      await sb.rpc('increment_product_stats', { p_id: op.id, p_precio: op.precio })
        .catch(() => { sb.from('productos').update({ ultimo_precio: op.precio }).eq('id', op.id).catch(() => {}); });
      break;
    case 'insert_producto':
      res = await sb.from('productos').insert(op.data);
      if (res.error) throw res.error; break;
    case 'update_producto':
      res = await sb.from('productos').update(op.data).eq('id', op.id);
      if (res.error) throw res.error; break;
    default: console.warn('[Sync] Unknown:', op.action);
  }
}

// ── Offline-aware mutation ──
async function mut(action, opts = {}) {
  if (navigator.onLine) {
    try { await executeOp({ action, ...opts }); return true; }
    catch (e) { console.warn('[mut] online fail, queuing:', e.message); }
  }
  await enqueue({ action, ...opts });
  return false;
}

// ── Network status UI ──
async function updateOfflineBadge() {
  const badge = document.getElementById('offlineBadge');
  if (!badge) return;

  const q = await getQueue().catch(() => []);

  const icons = {
    offline:  `<svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>`,
    syncing:  `<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    pending:  `<svg viewBox="0 0 24 24"><path d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z"/><path d="M12 8v4l2 2"/></svg>`,
  };

  if (!navigator.onLine) {
    badge.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        ${icons.offline}
        <span>${q.length ? `Offline · ${q.length} pendiente${q.length > 1 ? 's' : ''}` : 'Offline — sin conexión'}</span>
      </div>`;
    badge.className = 'offline-card show offline';
  } else if (SYNCING) {
    badge.innerHTML = `${icons.syncing} <span>Sincronizando...</span>`;
    badge.className = 'offline-card show syncing';
  } else if (q.length) {
    badge.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        ${icons.pending}
        <span>${q.length} pendiente${q.length > 1 ? 's' : ''} sin sincronizar</span>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="forceSyncQueue()" style="padding:5px 10px;border-radius:6px;background:var(--accent);border:none;color:#000;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">↻ Reintentar</button>
        <button onclick="clearQueue()" style="padding:5px 10px;border-radius:6px;background:none;border:1px solid rgba(239,68,68,.3);color:var(--err);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">Limpiar</button>
      </div>`;
    badge.className = 'offline-card show pending';
  } else {
    badge.className = 'offline-card';
  }
}

window.addEventListener('online', () => {
  flash('✅ Conexión restaurada', 'ok');
  updateOfflineBadge();
  setTimeout(syncQueue, 500);
});
window.addEventListener('offline', () => {
  flash('📡 Sin conexión — cambios se guardan local', 'info');
  updateOfflineBadge();
});

// Theme/accent handled by shared tokens.css (PEARS v3)

function flash(msg, type = 'ok') {
  const wrap = document.getElementById('flash-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  const colors = { ok:'#22c55e', err:'#ef4444', warn:'#F59E0B', info:'#60a5fa' };
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#111;border:1px solid ${colors[type]||colors.ok};color:${colors[type]||colors.ok};
    padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:300;
    white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.5);animation:fadeIn 120ms ease-out;`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openM(id) { document.getElementById(id).classList.add('open'); }
function closeM(id) { document.getElementById(id).classList.remove('open'); }

// ── USER MENU ──
function toggleMenu() { PearsHeader.toggle(); }
function closeMenu()  { PearsHeader.close(); }

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════
// Auth handled by shared/auth.js — see boot block at bottom

// ── CATEGORIAS (cached) ──
async function loadCats() {
  try {
    const { data } = await sb.from('categorias').select('*').order('orden');
    ALL_CATS = data || [];
    if (ALL_CATS.length) await cacheSet('categorias', ALL_CATS);
  } catch {
    const cached = await cacheGet('categorias');
    if (cached) ALL_CATS = cached;
  }
}
function getCats() { return ALL_CATS.filter(c => c.modulo === MODULE); }



// ── MODULE ──
function switchModule(mod) {
  MODULE = mod;
  document.getElementById('tabSuper').classList.toggle('active', mod === 'super');
  document.getElementById('tabFarmacia').classList.toggle('active', mod === 'farmacia');
  if (CUR_LISTA) goBack(); else showHome();
}

function goBack() {
  if (RT_CHANNEL) { sb.removeChannel(RT_CHANNEL); RT_CHANNEL = null; }
  CUR_LISTA = null; CUR_ITEMS = [];
  document.getElementById('fabBtn').style.display = 'flex';
  // Reset breadcrumb
  document.getElementById('bc-sep2').style.display = 'none';
  document.getElementById('bc-lista').style.display = 'none';
  showHome();
}

// ══════════════════════════════════════════
// HOME (cached for offline)
// ══════════════════════════════════════════
async function showHome() {
  const mc = document.getElementById('mc');
  mc.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">Cargando...</div>';
  document.getElementById('fabBtn').style.display = 'flex';

  let act = null, fin = null;
  try {
    console.log('[showHome] querying listas...');
    const r1 = await sb.from('listas').select('*').eq('modulo', MODULE).eq('estado', 'activa').order('created_at', { ascending: false });
    console.log('[showHome] r1:', r1.error?.message || 'ok', r1.data?.length);
    const r2 = await sb.from('listas').select('*').eq('modulo', MODULE).eq('estado', 'finalizada').order('created_at', { ascending: false }).limit(10);
    console.log('[showHome] r2:', r2.error?.message || 'ok', r2.data?.length);
    if (r1.error) throw r1.error;
    act = r1.data; fin = r2.data;
    await cacheSet(`home_act_${MODULE}`, act);
    await cacheSet(`home_fin_${MODULE}`, fin);
  } catch(e) {
    console.warn('[showHome] error:', e.message);
    act = await cacheGet(`home_act_${MODULE}`);
    fin = await cacheGet(`home_fin_${MODULE}`);
  }

  let h = '<div class="secTitle">Listas activas</div>';
  if (!act || !act.length) {
    h += `<div class="empty"><div class="emptyIcon">🛒</div>No hay listas activas.<br>Creá una nueva con el botón +</div>`;
  } else {
    act.forEach(l => {
      h += `<div class="card" onclick="openLista('${l.id}')">
        <div class="cardHead">
          <div class="cardTitle">${esc(l.titulo)}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="badge ok">Activa</span>
            <button class="btn-del" data-lista-id="${l.id}" data-lista-titulo="${esc(l.titulo)}" data-lista-estado="activa" onclick="event.stopPropagation(); delListaBtn(this)" title="Eliminar lista">🗑️</button>
          </div>
        </div>
        <div class="cardMeta">
          <span>${esc(l.tipo)}</span>
          ${l.presupuesto ? '<span>₲ ' + FMT(l.presupuesto) + '</span>' : ''}
          <span>${fmtD(l.created_at)}</span>
          <span>${esc(l.created_by)}</span>
        </div>
      </div>`;
    });
  }

  // Offline/pending card — debajo de las listas activas
  h += `<div id="offlineBadge" class="offline-card"></div>`;

  h += '<div class="secTitle" style="margin-top:24px">Historial</div>';
  if (!fin || !fin.length) {
    h += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:12px">Sin historial</div>';
  } else {
    fin.forEach(l => {
      h += `<div class="card" style="opacity:.55" onclick="openLista('${l.id}')">
        <div class="cardHead">
          <div class="cardTitle">${esc(l.titulo)}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="badge dim">Finalizada</span>
            <button class="btn-del" data-lista-id="${l.id}" data-lista-titulo="${esc(l.titulo)}" data-lista-estado="finalizada" onclick="event.stopPropagation(); delListaBtn(this)" title="Eliminar del historial">🗑️</button>
          </div>
        </div>
        <div class="cardMeta">
          ${l.supermercado ? '<span>' + esc(l.supermercado) + '</span>' : ''}
          <span>₲ ${FMT(l.total_real || l.total_estimado)}</span>
          <span>${fmtD(l.created_at)}</span>
        </div>
      </div>`;
    });
  }
  mc.innerHTML = h;
}

// ══════════════════════════════════════════
// LISTA CRUD (offline-first)
// ══════════════════════════════════════════
function showNewListaModal() {
  document.getElementById('nlT').value = '';
  document.getElementById('nlP').value = '';
  openM('mNL');
  setTimeout(() => document.getElementById('nlT').focus(), 200);
}

async function createLista() {
  const t = document.getElementById('nlT').value.trim();
  if (!t) { flash('Ponele un título', 'err'); return; }
  const id = 'list_' + UID();
  const lista = {
    id, titulo: t,
    tipo: document.getElementById('nlTp').value,
    modulo: MODULE, estado: 'activa',
    presupuesto: parseInt(document.getElementById('nlP').value) || 0,
    created_by: ROLE, created_at: new Date().toISOString()
  };
  const online = await mut('insert_lista', { data: lista });
  // Cache it locally regardless
  const cached = (await cacheGet(`home_act_${MODULE}`)) || [];
  cached.unshift(lista);
  await cacheSet(`home_act_${MODULE}`, cached);
  await cacheSet(`lista_${id}`, lista);
  await cacheSet(`items_${id}`, []);
  closeM('mNL');
  flash(online ? '✅ Lista creada' : '✅ Lista creada (se sincronizará)', online ? 'ok' : 'info');
  openLista(id);
}

function delListaBtn(btn) {
  const id = btn.dataset.listaId;
  const titulo = btn.dataset.listaTitulo;
  const estado = btn.dataset.listaEstado;
  delLista(id, titulo, estado);
}

async function delLista(id, titulo, estado) {
  try {
    // Si es activa, verificar que esté vacía
    if (estado === 'activa') {
      const { data: items } = await sb.from('lista_items').select('id').eq('lista_id', id);
      if (items && items.length > 0) {
        flash(`❌ No podés eliminar "${titulo}" porque tiene ${items.length} item${items.length > 1 ? 's' : ''}. Finalizala o vaciala primero.`, 'err');
        return;
      }
    }
    
    // Confirmación
    const msg = estado === 'activa' 
      ? `¿Eliminar lista "${titulo}"?`
      : `¿Eliminar "${titulo}" del historial?`;
    
    if (!confirm(msg)) return;
    
    // Eliminar items primero (por si tiene algunos, ej: lista finalizada)
    await mut('delete_items_by_lista', { lista_id: id });
    
    // Eliminar lista
    await mut('delete_lista', { id });
    
    flash('🗑️ Lista eliminada', 'ok');
    
    // Refresh home
    showHome();
  } catch (err) {
    console.error('[delLista] error:', err);
    flash('Error al eliminar: ' + err.message, 'err');
  }
}

async function openLista(id) {
  let l = null, items = null;
  try {
    const r1 = await sb.from('listas').select('*').eq('id', id).single();
    l = r1.data;
    const r2 = await sb.from('lista_items').select('*').eq('lista_id', id).order('orden');
    items = r2.data;
    if (l) await cacheSet(`lista_${id}`, l);
    if (items) await cacheSet(`items_${id}`, items);
  } catch {
    l = await cacheGet(`lista_${id}`);
    items = await cacheGet(`items_${id}`);
  }
  if (!l) { flash('No encontrada', 'err'); return; }
  CUR_LISTA = l;
  CUR_ITEMS = items || [];
  document.getElementById('fabBtn').style.display = 'none';
  // Update breadcrumb
  const sep2 = document.getElementById('bc-sep2');
  const bcLista = document.getElementById('bc-lista');
  if (sep2 && bcLista) {
    sep2.style.display = 'inline';
    bcLista.style.display = 'inline';
    bcLista.textContent = l.titulo;
  }
  await loadProductPhotos();
  renderDetail();
  initRealtime();
}

function renderDetail() {
  const mc = document.getElementById('mc');
  const l = CUR_LISTA, items = CUR_ITEMS, isA = l.estado === 'activa';
  const total = items.reduce((s, i) => s + (i.precio_estimado || 0) * (i.cantidad || 1), 0);
  const ck = items.filter(i => i.checked).length;
  const pct = items.length ? (ck / items.length * 100) : 0;
  const bPct = l.presupuesto ? (total / l.presupuesto * 100) : 0;

  const co = getCats().map(c => c.nombre);
  const gr = {};
  items.forEach(i => { if (!gr[i.categoria]) gr[i.categoria] = []; gr[i.categoria].push(i); });
  const sg = Object.entries(gr).sort((a, b) => {
    const ia = co.indexOf(a[0]), ib = co.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  let h = `<div style="margin-bottom:12px"><button class="btn sm" onclick="goBack()" style="font-size:11px;color:var(--muted)">&#8592; Volver a listas</button></div>
    <div style="font-size:15px;font-weight:700;margin-bottom:2px">${esc(l.titulo)}</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:14px;font-family:var(--mono)">${esc(l.tipo)} · ${fmtD(l.created_at)} · ${esc(l.created_by)}</div>`;

  if (isA) {
    h += `<div class="searchWrap">
      <input class="searchInput" id="sIn" placeholder="Escribí un producto y Enter..." autocomplete="off"
        oninput="onSrch(this.value)" onkeydown="onSrchKey(event)" onfocus="onSrchFocus()" onblur="setTimeout(hideDd,200)"/>
      <div class="dropdown" id="sDd"></div>
    </div>
    <div class="searchHint">Escribí → Enter para agregar · Tap en item para editar</div>`;
  }

  if (l.presupuesto > 0) {
    const bc = bPct > 90 ? 'var(--err)' : bPct > 70 ? 'var(--warn)' : 'var(--ok)';
    h += `<div class="budgetBar">
      <div class="budgetRow">
        <span style="color:var(--muted)">Presupuesto</span>
        <span style="font-weight:700;font-family:var(--mono);color:${bPct > 90 ? 'var(--err)' : 'var(--text)'}">₲ ${FMT(total)} / ${FMT(l.presupuesto)}</span>
      </div>
      <div class="budgetTrack"><div class="budgetFill" style="width:${Math.min(bPct, 100)}%;background:${bc}"></div></div>
    </div>`;
  }

  h += `<div class="statsRow">
    <span><strong>${items.length}</strong> items</span>
    <span><strong>${ck}</strong> ✓</span>
    <span>₲ <strong>${FMT(total)}</strong></span>
  </div>`;
  h += `<div class="progressWrap"><div class="progressFill" style="width:${pct}%"></div></div>`;

  if (!items.length) {
    h += `<div class="empty"><div class="emptyIcon">📝</div>Escribí arriba para buscar productos.<br>Enter = agregar rápido.</div>`;
  } else {
    sg.forEach(([cat, ci]) => {
      const catI = ALL_CATS.find(c => c.nombre === cat);
      const ckC = ci.filter(i => i.checked).length;
      h += `<div class="catGroup">
        <div class="catHead"><span>${catI?.icono || '📦'}</span> ${esc(cat)} <span class="cnt">${ckC}/${ci.length}</span></div>`;
      ci.forEach(it => {
        h += `<div class="checkItem${it.checked ? ' chk' : ''}" id="ci_${it.id}">
          <div class="ckb" onclick="togCk('${it.id}')">${it.checked ? '✓' : ''}</div>
          <div class="ckThumb">${(() => { const _p = PROD_PHOTOS[it.producto_id]; const _u = (_p && window.SatolinaStorage) ? SatolinaStorage.url('product-photos', _p) : (_p || ''); return _u ? '<img src="'+esc(_u)+'" loading="lazy">' : '<span class="tIcon">' + (catI?.icono || '') + '</span>'; })()}</div>
          <div class="ckBody" onclick="openEI('${it.id}')">
            <div class="ckName">${esc(it.nombre)}</div>
            <div class="ckDets">
              ${it.tamano ? '<span>' + esc(it.tamano) + '</span>' : ''}
              ${!it.tamano && it.unidad !== 'un' ? '<span>' + esc(it.unidad) + '</span>' : ''}
              ${it.marca ? '<span class="ckBrand">' + esc(it.marca) + '</span>' : ''}
              ${it.marca_alt ? '<span class="ckBrand" style="color:var(--dim)">alt: ' + esc(it.marca_alt) + '</span>' : ''}
              ${it.notas ? '<span style="font-style:italic">' + esc(it.notas) + '</span>' : ''}
              <span class="ckBy">${esc(it.added_by)}</span>
            </div>
          </div>
          <div class="ckRight">
            ${it.precio_estimado ? '<span class="ckPrice">₲' + FMT(it.precio_estimado * it.cantidad) + '</span>' : ''}
            ${isA ? `<div class="qtyW">
              <button class="qtyB" onclick="chgQty('${it.id}',-1)">−</button>
              <span class="qtyV">${it.cantidad}</span>
              <button class="qtyB" onclick="chgQty('${it.id}',1)">+</button>
            </div>
            <button class="delB" onclick="rmItem('${it.id}')">🗑</button>` : ''}
          </div>
        </div>`;
      });
      h += '</div>';
    });
  }

  if (isA && items.length) {
    h += `<div class="actionBar">
      <button class="btn" onclick="showSh()">📤 Compartir</button>
      <button class="btn success f1" onclick="showFin()">✅ Finalizar</button>
    </div>`;
  }
  mc.innerHTML = h;
  cacheSet(`items_${l.id}`, items);
}

// ══════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════
function onSrch(v) {
  clearTimeout(SEARCH_TO);
  if (v.length < 1) { hideDd(); S_RES = []; return; }
  SEARCH_TO = setTimeout(async () => {
    const q = NORM(v);
    try {
      const { data } = await sb.from('productos')
        .select('*')
        .or(`nombre_norm.ilike.%${q}%,tags.ilike.%${q}%`)
        .eq('modulo', MODULE)
        .order('veces_comprado', { ascending: false })
        .limit(8);
      S_RES = data || [];
      if (S_RES.length) await cacheSet('productos_search', S_RES);
    } catch {
      const cached = await cacheGet('productos_search');
      S_RES = (cached || []).filter(p => NORM(p.nombre).includes(q) || (p.tags || '').includes(q));
    }
    SEL_IDX = 0; renderDd(v);
  }, 120);
}
function renderDd(q) {
  const dd = document.getElementById('sDd'); if (!dd || !q.trim()) return;
  let h = `<div class="ddNew" onpointerdown="event.preventDefault();showNP()" style="border-top:none;border-bottom:1px solid var(--border)">+ Crear "${esc(q)}" como nuevo</div>`;
  S_RES.forEach((r, i) => {
    h += `<div class="ddItem${i === SEL_IDX ? ' sel' : ''}" onpointerdown="event.preventDefault();qAdd(${i})" onmouseenter="SEL_IDX=${i};renderDd('${esc(q).replace(/'/g, "\\'")}')">
      <div>
        <div class="ddItem-name">${esc(r.nombre)}</div>
        <div class="ddItem-meta"><span class="ddItem-cat">${esc(r.categoria)}</span>${r.veces_comprado ? '<span>' + r.veces_comprado + 'x</span>' : ''}</div>
      </div>
      ${r.ultimo_precio ? '<span class="ddItem-price">₲' + FMT(r.ultimo_precio) + '</span>' : ''}
    </div>`;
  });
  dd.innerHTML = h; dd.classList.add('show');
}
function onSrchFocus() { if (S_RES.length) document.getElementById('sDd')?.classList.add('show'); }
function hideDd() { document.getElementById('sDd')?.classList.remove('show'); }
function onSrchKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); SEL_IDX = Math.min(SEL_IDX + 1, S_RES.length - 1); renderDd(e.target.value); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); SEL_IDX = Math.max(SEL_IDX - 1, 0); renderDd(e.target.value); }
  else if (e.key === 'Enter') { e.preventDefault(); if (S_RES.length) qAdd(SEL_IDX); }
  else if (e.key === 'Escape') { hideDd(); e.target.value = ''; S_RES = []; }
}

// ══════════════════════════════════════════
// MUTATIONS (optimistic + offline queue)
// ══════════════════════════════════════════
async function qAdd(idx) {
  const p = S_RES[idx]; if (!p) return;
  hideDd();
  const inp = document.getElementById('sIn'); if (inp) inp.value = ''; S_RES = [];
  const ex = CUR_ITEMS.find(i => i.producto_id === p.id);
  if (ex) {
    ex.cantidad += 1;
    await mut('update_item', { id: ex.id, data: { cantidad: ex.cantidad } });
    flash(`${p.nombre} → +1`, 'info');
  } else {
    const id = 'i_' + UID();
    const item = {
      id, lista_id: CUR_LISTA.id, producto_id: p.id,
      nombre: p.nombre, categoria: p.categoria,
      cantidad: 1, unidad: p.unidad_default || 'un',
      tamano: '', marca: p.marca_default || '',
      marca_alt: p.marca_alternativa || '',
      precio_estimado: p.ultimo_precio || 0,
      precio_real: 0, notas: '', checked: false,
      orden: CUR_ITEMS.length + 1,
      added_by: ROLE, added_at: new Date().toISOString()
    };
    await mut('insert_item', { data: item });
    CUR_ITEMS.push(item);
    flash(`✅ ${p.nombre}`);
  }
  renderDetail();
  setTimeout(() => { const i = document.getElementById('sIn'); if (i) i.focus(); }, 100);
}

async function togCk(id) {
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  it.checked = !it.checked;
  // Pip sound on check
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = it.checked ? 1200 : 600;
    gain.gain.value = 0.1;
    osc.start(); osc.stop(ctx.currentTime + 0.08);
  } catch(e) {}
  if (it.checked && navigator.vibrate) navigator.vibrate(30);
  await mut('update_item', { id, data: { checked: it.checked, checked_by: it.checked ? ROLE : '', checked_at: it.checked ? new Date().toISOString() : null } });
  renderDetail();
}

async function chgQty(id, d) {
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  it.cantidad = Math.max(1, it.cantidad + d);
  await mut('update_item', { id, data: { cantidad: it.cantidad } });
  renderDetail();
}

async function rmItem(id) {
  CUR_ITEMS = CUR_ITEMS.filter(i => i.id !== id);
  await mut('delete_item', { id });
  flash('🗑 Eliminado'); renderDetail();
}

// ── Edit ──
function openEI(id) {
  if (CUR_LISTA.estado !== 'activa') return;
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  document.getElementById('eiId').value = id;
  document.getElementById('eiTitle').textContent = '✏️ ' + it.nombre;
  document.getElementById('eiNombre').value = it.nombre || '';
  const sel = document.getElementById('eiCat');
  sel.innerHTML = ALL_CATS.filter(c => c.modulo === MODULE).map(c =>
    `<option value="${esc(c.nombre)}"${c.nombre === it.categoria ? ' selected' : ''}>${c.icono} ${esc(c.nombre)}</option>`
  ).join('');
  document.getElementById('eiTam').value = it.tamano || '';
  document.getElementById('eiUn').value = it.unidad || 'un';
  document.getElementById('eiMa').value = it.marca || '';
  document.getElementById('eiMaA').value = it.marca_alt || '';
  document.getElementById('eiPr').value = it.precio_estimado || '';
  document.getElementById('eiNo').value = it.notas || '';
  // Show existing photo
  const eiPh = document.getElementById('eiPhoto');
  const _phPath = PROD_PHOTOS[it.producto_id] || '';
  const phUrl = (_phPath && window.SatolinaStorage)
    ? SatolinaStorage.url('product-photos', _phPath)
    : _phPath;
  if (eiPh) { eiPh.src = phUrl; eiPh.style.display = phUrl ? 'block' : 'none'; }
  const eiPhP = document.getElementById('eiPhotoPlaceholder'); if(eiPhP) eiPhP.style.display = phUrl ? 'none' : 'flex';
  document.getElementById('eiBarcode').value = '';
  document.getElementById('eiBarcodeLabel').textContent = '';
  const eiPhFile = document.getElementById('eiPhotoFile');
  if (eiPhFile) { eiPhFile.value = ''; eiPhFile._pendingFile = null; }
  openM('mEI');
}

async function saveEdit() {
  const id = document.getElementById('eiId').value;
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  // Upload photo if pending
  const photoInput = document.getElementById('eiPhotoFile');
  if (photoInput && photoInput._pendingFile && it.producto_id) {
    await uploadProductPhoto(photoInput._pendingFile, it.producto_id);
    photoInput._pendingFile = null;
  }
  const u = {
    nombre: document.getElementById('eiNombre').value.trim() || it.nombre,
    categoria: document.getElementById('eiCat').value,
    tamano: document.getElementById('eiTam').value,
    unidad: document.getElementById('eiUn').value,
    marca: document.getElementById('eiMa').value,
    marca_alt: document.getElementById('eiMaA').value,
    precio_estimado: parseInt(document.getElementById('eiPr').value) || 0,
    notas: document.getElementById('eiNo').value
  };
  Object.assign(it, u);
  await mut('update_item', { id, data: u });
  closeM('mEI'); flash('💾 Guardado'); renderDetail();
}

function delFromEdit() { const id = document.getElementById('eiId').value; closeM('mEI'); rmItem(id); }

// ── New Product ──
function showNP() {
  const inp = document.getElementById('sIn');
  document.getElementById('npN').value = inp ? inp.value : '';
  document.getElementById('npC').innerHTML = getCats().map(c =>
    `<option value="${esc(c.nombre)}">${c.icono} ${esc(c.nombre)}</option>`
  ).join('');
  hideDd(); openM('mNP');
}

async function createProd() {
  const n = document.getElementById('npN').value.trim();
  if (!n) { flash('Ponele nombre', 'err'); return; }
  const id = 'p_' + UID();

  const npBarcode = document.getElementById('npBarcode')?.value || '';
  await mut('insert_producto', { data: { id, nombre: n, nombre_norm: NORM(n), categoria: document.getElementById('npC').value, unidad_default: document.getElementById('npU').value, modulo: MODULE, tags: n.toLowerCase(), codigo_barras: npBarcode } });
  // Upload photo if pending
  const npPhotoInput = document.getElementById('npPhotoFile');
  if (npPhotoInput && npPhotoInput._pendingFile) {
    await uploadProductPhoto(npPhotoInput._pendingFile, id);
    npPhotoInput._pendingFile = null;
  }
  closeM('mNP');
  S_RES = [{ id, nombre: n, categoria: document.getElementById('npC').value, unidad_default: document.getElementById('npU').value, ultimo_precio: 0, veces_comprado: 0 }];
  await qAdd(0);
}

// ══════════════════════════════════════════
// FINALIZAR
// ══════════════════════════════════════════
function showFin() {
  const items = CUR_ITEMS, ck = items.filter(i => i.checked).length;
  const total = items.reduce((s, i) => s + (i.precio_estimado || 0) * (i.cantidad || 1), 0);
  document.getElementById('finI').textContent = ck + ' ✓ / ' + items.length;
  document.getElementById('finTo').textContent = '₲ ' + FMT(total);
  document.getElementById('finCl').textContent = WEATHER_DATA ? `🌡 ${WEATHER_DATA.temp}° ${weatherDesc(WEATHER_DATA.code)}` : '--';
  document.getElementById('finS').value = '';
  document.getElementById('finN').value = '';
  FIN_RATING = 0;
  const st = document.getElementById('finSt');
  st.innerHTML = [1, 2, 3, 4, 5].map(v => `<span class="star" onclick="setRating(${v})">★</span>`).join('');
  openM('mFin');
}
function setRating(v) {
  FIN_RATING = v;
  document.querySelectorAll('#finSt .star').forEach((s, i) => s.classList.toggle('on', i < v));
}

async function confirmFin(modo = 'comprar') {
  const sup = document.getElementById('finS').value.trim() || 'Super';
  const total = CUR_ITEMS.reduce((s, i) => s + (i.precio_estimado || 0) * (i.cantidad || 1), 0);
  const upd = {
    estado: 'finalizada', supermercado: sup,
    rating_super: FIN_RATING,
    notas_super: document.getElementById('finN').value,
    total_estimado: total, total_real: total,
    finalizada_at: new Date().toISOString(), finalizada_by: ROLE
  };
  if (WEATHER_DATA) { upd.temperatura = WEATHER_DATA.temp; upd.clima = weatherDesc(WEATHER_DATA.code); }
  await mut('update_lista', { id: CUR_LISTA.id, data: upd });

  // Si modo === 'comprar', guardar items checked en historial
  if (modo === 'comprar') {
    for (const it of CUR_ITEMS) {
      if (it.checked) {
        await mut('insert_historial', { data: { id: 'h_' + UID(), lista_id: CUR_LISTA.id, producto_id: it.producto_id, nombre: it.nombre, categoria: it.categoria, cantidad: it.cantidad, unidad: it.unidad, tamano: it.tamano, marca: it.marca, precio: it.precio_estimado, supermercado: sup, usuario: ROLE } });
        if (it.producto_id) await mut('increment_product', { id: it.producto_id, precio: it.precio_estimado });
      }
    }
  }
  
  closeM('mFin');
  CUR_LISTA.estado = 'finalizada';
  
  // Carry-over: items no comprados → nueva lista "Falta Comprar"
  // Si modo === 'cancelar', TODOS los items van a "Falta Comprar"
  // Si modo === 'comprar', solo los NO tildados
  const noComprados = modo === 'cancelar' 
    ? CUR_ITEMS 
    : CUR_ITEMS.filter(it => !it.checked);
  
  console.log('[CARRY-OVER] Modo:', modo, '| Items a copiar:', noComprados.length, noComprados);
  
  if (noComprados.length > 0) {
    try {
      console.log('[CARRY-OVER] Buscando lista "Falta Comprar"...');
      // Buscar lista "Falta Comprar" activa
      const { data: listas, error: searchError } = await sb
        .from('listas')
        .select('*')
        .eq('modulo', MODULE)
        .eq('estado', 'activa')
        .eq('titulo', 'Falta Comprar');
      
      if (searchError) throw searchError;
      console.log('[CARRY-OVER] Búsqueda resultado:', listas);
      
      let listaFaltante;
      
      // Si no existe, crearla
      if (!listas || listas.length === 0) {
        console.log('[CARRY-OVER] Creando nueva lista "Falta Comprar"...');
        const nuevaLista = {
          id: 'l_' + UID(),
          titulo: 'Falta Comprar',
          modulo: MODULE,
          estado: 'activa',
          created_by: ROLE,
          created_at: new Date().toISOString()
        };
        await mut('insert_lista', { data: nuevaLista });
        listaFaltante = nuevaLista;
        console.log('[CARRY-OVER] Lista creada:', listaFaltante.id);
      } else {
        listaFaltante = listas[0];
        console.log('[CARRY-OVER] Lista encontrada:', listaFaltante.id);
      }
      
      // Copiar items no comprados
      console.log('[CARRY-OVER] Copiando', noComprados.length, 'items...');
      for (const item of noComprados) {
        const nuevoItem = {
          id: 'i_' + UID(),
          lista_id: listaFaltante.id,
          producto_id: item.producto_id,
          nombre: item.nombre,
          categoria: item.categoria,
          cantidad: item.cantidad,
          unidad: item.unidad,
          tamano: item.tamano,
          marca: item.marca,
          marca_alt: item.marca_alt,
          precio_estimado: item.precio_estimado,
          precio_real: 0,
          notas: item.notas || '',
          checked: false,
          orden: 0,
          added_by: ROLE,
          added_at: new Date().toISOString()
        };
        await mut('insert_item', { data: nuevoItem });
        console.log('[CARRY-OVER] Item copiado:', nuevoItem.nombre);
      }
      
      console.log('[CARRY-OVER] Completado exitosamente');
      const msg = modo === 'cancelar'
        ? `❌ Compra cancelada · ${noComprados.length} items → "Falta Comprar"`
        : `✅ Compra finalizada · ${noComprados.length} items → "Falta Comprar"`;
      flash(msg, 'ok');
    } catch (err) {
      console.error('[CARRY-OVER ERROR]:', err);
      const msg = modo === 'cancelar'
        ? `❌ Compra cancelada (error al copiar items: ${err.message})`
        : `✅ Compra finalizada (error al copiar ${noComprados.length} items: ${err.message})`;
      flash(msg, 'warn');
    }
  } else {
    const msg = modo === 'cancelar'
      ? '❌ Compra cancelada (sin items pendientes)'
      : '✅ Compra finalizada y guardada';
    flash(msg, 'ok');
  }
  
  renderDetail();
}

// ══════════════════════════════════════════
// SHARE
// ══════════════════════════════════════════
function showSh() {
  const items = CUR_ITEMS, co = getCats().map(c => c.nombre);
  const gr = {};
  items.filter(i => !i.checked).forEach(i => { if (!gr[i.categoria]) gr[i.categoria] = []; gr[i.categoria].push(i); });
  const sg = Object.entries(gr).sort((a, b) => { const ia = co.indexOf(a[0]), ib = co.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  let t = `🛒 ${CUR_LISTA.titulo}\n📅 ${new Date().toLocaleDateString('es-PY')}\n`;
  sg.forEach(([cat, ci]) => {
    t += `\n*${cat}:*\n`;
    ci.forEach(i => {
      t += `□ ${i.nombre}`;
      if (i.cantidad > 1) t += ` x${i.cantidad}`;
      if (i.tamano) t += ` ${i.tamano}`;
      else if (i.unidad !== 'un') t += ` ${i.unidad}`;
      if (i.marca) t += ` (${i.marca})`;
      if (i.notas) t += ` — ${i.notas}`;
      t += '\n';
    });
  });
  t += '\n📝 SatolinaApp';
  document.getElementById('shTxt').textContent = t;
  openM('mSh');
}
function copySh() { navigator.clipboard.writeText(document.getElementById('shTxt').textContent); closeM('mSh'); flash('📋 Copiado'); }
function sendWA() { window.open('https://wa.me/?text=' + encodeURIComponent(document.getElementById('shTxt').textContent), '_blank'); closeM('mSh'); }

// ══════════════════════════════════════════

// ======================================================
// PHOTO UPLOAD
// ======================================================
async function uploadProductPhoto(file, productId) {
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = 'productos/' + productId + '.' + ext;
    const { error } = await sb.storage.from('product-photos').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = sb.storage.from('product-photos').getPublicUrl(path);
    const url = urlData.publicUrl + '?t=' + Date.now();
    PROD_PHOTOS[productId] = url;
    await mut('update_producto', { id: productId, data: { foto_url: url } });
    return url;
  } catch (e) { console.warn('Photo upload failed:', e); return null; }
}

function onPhotoSelect(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const prev = document.getElementById('eiPhoto');
  if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
  const _ph = document.getElementById('eiPhotoPlaceholder'); if(_ph) _ph.style.display = 'none';
  input._pendingFile = file;
}

function onNpPhotoSelect(input) {
  if (!input.files || !input.files[0]) return;
  input._pendingFile = input.files[0];
  flash('Foto lista');
}

// ======================================================
// BARCODE SCANNER
// ======================================================
function startScanner(ctx) {
  SCANNER_CTX = ctx;
  const wrap = document.getElementById('scannerWrap');
  if (!wrap) return;
  wrap.classList.add('show');
  try {
    _scanner = new Html5Qrcode('scannerReader');
    _scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 100 }, formatsToSupport: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] },
      onScanSuccess,
      () => {}
    ).catch(e => { flash('No se pudo acceder a la camara', 'err'); stopScanner(); });
  } catch(e) { flash('Scanner no disponible', 'err'); stopScanner(); }
}

function stopScanner() {
  const wrap = document.getElementById('scannerWrap');
  if (wrap) wrap.classList.remove('show');
  if (_scanner) {
    _scanner.stop().catch(() => {});
    _scanner.clear();
    _scanner = null;
  }
}

function onScanSuccess(code) {
  stopScanner();
  if (navigator.vibrate) navigator.vibrate(100);
  flash('Codigo: ' + code);
  if (SCANNER_CTX === 'edit') {
    const el = document.getElementById('eiBarcode');
    if (el) el.value = code;
    const lbl = document.getElementById('eiBarcodeLabel');
    if (lbl) lbl.textContent = 'Codigo: ' + code;
    // Save barcode to product
    const id = document.getElementById('eiId')?.value;
    const it = CUR_ITEMS.find(i => i.id === id);
    if (it) mut('update_producto', { id: it.producto_id, data: { codigo_barras: code } });
  } else if (SCANNER_CTX === 'new') {
    const el = document.getElementById('npBarcode');
    if (el) el.value = code;
    const lbl = document.getElementById('npBarcodeLabel');
    if (lbl) lbl.textContent = 'Codigo: ' + code;
  } else if (SCANNER_CTX === 'search') {
    // Search by barcode
    searchByBarcode(code);
  }
}

async function searchByBarcode(code) {
  try {
    const { data } = await sb.from('productos')
      .select('*')
      .eq('codigo_barras', code)
      .eq('modulo', MODULE)
      .limit(1);
    if (data && data.length) {
      S_RES = data;
      await qAdd(0);
    } else {
      flash('Producto no encontrado para este codigo', 'err');
    }
  } catch(e) { flash('Error buscando', 'err'); }
}

// ======================================================
// REALTIME NOTIFICATIONS
// ======================================================
let RT_CHANNEL = null;
const RT_SOUND_URL = 'data:audio/wav;base64,UklGRlQFAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YTAFAACAgICAgICAgICAgICAgICBhY2YqLbB0Nzl7PD08fDt5tzQwbamkIGAgICAgICA';

function initRealtime() {
  if (!CUR_LISTA) return;
  // Request notification permission for background alerts
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  if (RT_CHANNEL) { sb.removeChannel(RT_CHANNEL); RT_CHANNEL = null; }
  RT_CHANNEL = sb.channel('items_' + CUR_LISTA.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'lista_items',
      filter: 'lista_id=eq.' + CUR_LISTA.id
    }, payload => onRtInsert(payload.new))
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'lista_items',
      filter: 'lista_id=eq.' + CUR_LISTA.id
    }, payload => onRtUpdate(payload.new))
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'lista_items',
      filter: 'lista_id=eq.' + CUR_LISTA.id
    }, payload => onRtDelete(payload.old))
    .subscribe();
}

function onRtInsert(newItem) {
  if (!CUR_LISTA) return;
  const exists = CUR_ITEMS.find(i => i.id === newItem.id);
  if (exists) return; // We added it ourselves
  if (newItem.added_by === ROLE) return;
  CUR_ITEMS.push(newItem);
  renderDetail();
  // Notifications
  rtNotify(newItem.nombre + ' agregado por ' + (newItem.added_by || '?'));
  // Highlight the new item
  setTimeout(() => {
    const el = document.getElementById('ci_' + newItem.id);
    if (el) el.classList.add('newItemAnim');
  }, 100);
}

function onRtUpdate(updated) {
  if (!CUR_LISTA) return;
  const idx = CUR_ITEMS.findIndex(i => i.id === updated.id);
  if (idx >= 0) { CUR_ITEMS[idx] = { ...CUR_ITEMS[idx], ...updated }; renderDetail(); }
}

function onRtDelete(old) {
  if (!CUR_LISTA) return;
  CUR_ITEMS = CUR_ITEMS.filter(i => i.id !== old.id);
  renderDetail();
}

function rtNotify(msg) {
  flash(msg, 'ok');
  // Triple pip sound
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1100, 1320];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.value = 0.15;
        osc.start(); osc.stop(ctx.currentTime + 0.12);
      }, i * 160);
    });
  } catch(e) {}
  // Strong vibration pattern
  if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 150]);
  // Pulse border on app
  const app = document.getElementById('app') || document.body;
  app.classList.add('rtPulse');
  setTimeout(() => app.classList.remove('rtPulse'), 3500);
  // System notification (works with screen off / app in background)
  if (Notification.permission === "granted") {
    try { new Notification("PEARS Compras", { body: msg, icon: "/pears-icon.svg", tag: "rt-" + Date.now(), vibrate: [200, 100, 200, 100, 300] }); } catch(e) {}
  }
}

// ======================================================
// LOAD PRODUCT PHOTOS
// ======================================================
async function loadProductPhotos() {
  if (!CUR_ITEMS.length) return;
  const pids = [...new Set(CUR_ITEMS.map(i => i.producto_id).filter(Boolean))];
  if (!pids.length) return;
  try {
    const { data } = await sb.from('productos')
      .select('id, foto_url')
      .in('id', pids);
    if (!data) return;
    // Phase Privatization P2: store normalized PATH (not full URL) in PROD_PHOTOS
    // and bulk-preload signed URLs from the helper cache.
    const allValues = data.map(p => p.foto_url).filter(Boolean);
    if (window.SatolinaStorage) {
      try { await SatolinaStorage.preload('product-photos', allValues); } catch(e){}
    }
    data.forEach(p => {
      if (!p.foto_url) return;
      const path = window.SatolinaStorage
        ? SatolinaStorage.extractPath(p.foto_url, 'product-photos') || p.foto_url
        : p.foto_url;
      PROD_PHOTOS[p.id] = path;
    });
  } catch(e) {}
}



/* ─ Sync UI ─ */
async function renderSyncBtn() {
  const wrap = document.getElementById('menuSyncWrap');
  if (!wrap) return;
  const q = await getQueue().catch(() => []);
  if (!q.length) {
    wrap.innerHTML = '<div style="font-size:11px;color:var(--ok);display:flex;align-items:center;gap:5px;padding:6px 0;"><span>✓</span> Todo sincronizado</div>';
    return;
  }
  wrap.innerHTML = `
    <div style="font-size:11px;color:var(--warn);margin-bottom:6px;">⏳ ${q.length} pendiente${q.length>1?'s':''} sin sincronizar</div>
    <div style="display:flex;gap:6px;">
      <button onclick="forceSyncQueue()" style="flex:1;padding:7px;border-radius:8px;background:var(--accent);border:none;color:#fff;font-size:11px;font-weight:600;cursor:pointer;">↻ Reintentar</button>
      <button onclick="clearQueue()" style="padding:7px 10px;border-radius:8px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.3);color:var(--err);font-size:11px;font-weight:600;cursor:pointer;">🗑 Limpiar</button>
    </div>`;
}

async function forceSyncQueue() {
  closeMenu();
  flash('↻ Sincronizando...', 'info');
  SYNCING = false; // reset flag in case it got stuck
  await syncQueue();
  updateOfflineBadge();
}

async function clearQueue() {
  if (!confirm('¿Limpiar los ' + (await getQueue()).length + ' pendientes? Se perderán los cambios no sincronizados.')) return;
  const db = await openDB();
  await new Promise(res => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').clear();
    tx.oncomplete = res; tx.onerror = res;
  });
  flash('Cola limpiada.', 'ok');
  closeMenu();
  updateOfflineBadge();
}
// INIT
// ══════════════════════════════════════════
openDB().catch(() => console.warn('IndexedDB not available'));
// ══════════════════════════════════════════
// BOOT — shared auth
// ══════════════════════════════════════════
Auth.onReady(user => {
  if (!user) { window.location.href = '/'; return; }

  sb   = Auth.client();
  USER = user;
  ROLE = user.nombre;

  document.getElementById('app')?.classList.add('active');
  PearsHeader.init('compras');

  const whoEl = document.getElementById('whoLabel');
  if (whoEl) whoEl.textContent = ROLE;

  updateOfflineBadge();
  loadCats().catch(() => {}).then(() => showHome());
  if (navigator.onLine) setTimeout(syncQueue, 1000);
});

// ══════════════════════════════════════════
// SESSION RECOVERY (unlock screen / tab switch)
// ══════════════════════════════════════════
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && USER) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { data: ref } = await sb.auth.refreshSession();
        if (!ref?.session) { flash('Sesión expirada — recargá', 'err'); return; }
      }
      // Refresh list data if inside a list
      if (CUR_LISTA) {
        const { data: items } = await sb.from('lista_items').select('*').eq('lista_id', CUR_LISTA.id).order('orden');
        if (items) { CUR_ITEMS = items; await loadProductPhotos(); renderDetail(); }
      }
    } catch(e) { console.warn('Session recovery:', e); }
  }
});

// ══════════════════════════════════════════
// ANDROID BACK GESTURE — navigation by layers
// ══════════════════════════════════════════
let NAV_STACK = ['home']; // track navigation layers

function navPush(state) {
  NAV_STACK.push(state);
  history.pushState({ nav: state, depth: NAV_STACK.length }, '');
}

// Override goBack to manage nav stack
const _origGoBack = goBack;
goBack = function() {
  _origGoBack();
  // Reset stack to home level
  NAV_STACK = ['home'];
};

// Intercept openLista to push nav state
const _origOpenLista = openLista;
openLista = async function(id) {
  await _origOpenLista(id);
  navPush('lista-' + id);
};

// Intercept modal opens to push nav state
const _origOpenM = typeof openM === 'function' ? openM : null;
if (_origOpenM) {
  openM = function(id) {
    _origOpenM(id);
    navPush('modal-' + id);
  };
}

// Intercept openEI to push nav state
const _origOpenEI = openEI;
openEI = async function(id) {
  await _origOpenEI(id);
  navPush('edit-' + id);
};

window.addEventListener('popstate', (e) => {
  // Figure out what to close
  if (NAV_STACK.length <= 1) {
    // At home level — let browser handle (go to home page)
    return;
  }
  const current = NAV_STACK.pop();
  
  // Close modals first
  if (current && current.startsWith('modal-')) {
    const modalId = current.replace('modal-', '');
    const el = document.getElementById(modalId);
    if (el && el.classList.contains('open')) {
      if (_origOpenM) { el.classList.remove('open'); } else { closeM(modalId); }
    }
    return;
  }
  // Close edit modal
  if (current && current.startsWith('edit-')) {
    closeM('mEI');
    return;
  }
  // Close scanner
  if (document.getElementById('scannerWrap') && document.getElementById('scannerWrap').classList.contains('open')) {
    closeScanner();
    return;
  }
  // Close pref dropdown
  if (document.getElementById('prefDrop') && document.getElementById('prefDrop').classList.contains('open')) {
    closePref();
    return;
  }
  // If inside a list, go back to home of lists
  if (current && current.startsWith('lista-')) {
    _origGoBack();
    NAV_STACK = ['home'];
    return;
  }
});

// Push initial state
history.replaceState({ nav: 'home', depth: 1 }, '');

// ══════════════════════════════════════════
// NOTIFICATION PERMISSION (for lock screen pips)
// ══════════════════════════════════════════
if ('Notification' in window && Notification.permission === 'default') {
  // Ask after first user interaction
  document.addEventListener('click', function askNotif() {
    Notification.requestPermission();
    document.removeEventListener('click', askNotif);
  }, { once: true });
}
