// ============================================
// SATOLINA COMPRAS — App Logic v1.1.0
// Supabase SDK v2 · PKCE · Session Sharing
// ============================================
const SB_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhaGhtcHZmeXJtd25hcXhpYnZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTQ1NDIsImV4cCI6MjA4NzczMDU0Mn0.3ZWW_y_2XP93l1QB5x3Fe9vfdWRMypbvk1PTR8iD1dM';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

let USER = null, ROLE = '', MODULE = 'super';
let CUR_LISTA = null, CUR_ITEMS = [];
let ALL_CATS = [], WEATHER_DATA = null, IS_DARK = true;
let SEARCH_TO = null, SEL_IDX = 0, S_RES = [], FIN_RATING = 0;
let BOOT_DONE = false;

const FMT = n => new Intl.NumberFormat('es-PY').format(n || 0);
const UID = () => crypto.randomUUID().substring(0, 12);
const NORM = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtD = d => { try { return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) } catch { return '' } };

// ── THEME ──
IS_DARK = localStorage.getItem('satolina_theme') !== 'light';
function applyTheme() {
  document.documentElement.classList.toggle('light', !IS_DARK);
  document.documentElement.setAttribute('data-theme', IS_DARK ? '' : 'light');
}
applyTheme();

function applyAccent(c) {
  if (!c) return;
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--accent2', c + 'cc');
  document.documentElement.style.setProperty('--accent-glow', c + '1f');
  localStorage.setItem('satolina_accent', c);
}
const savedAccent = localStorage.getItem('satolina_accent');
if (savedAccent) applyAccent(savedAccent);

// ── FLASH ──
function flash(msg, type = 'ok') {
  const w = document.getElementById('flashWrap');
  const d = document.createElement('div'); d.className = 'flash ' + type; d.textContent = msg;
  w.appendChild(d); setTimeout(() => d.remove(), 3000);
}

// ── MODAL ──
function openM(id) { document.getElementById(id).classList.add('open'); }
function closeM(id) { document.getElementById(id).classList.remove('open'); }

// ── USER MENU ──
function toggleMenu() {
  const m = document.getElementById('menuOverlay');
  const isOpen = m.style.display === 'flex';
  m.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    document.getElementById('menuName').textContent = ROLE || '—';
    document.getElementById('menuEmail').textContent = USER?.email || '—';
    renderAccentPicker();
  }
}
function closeMenu() {
  document.getElementById('menuOverlay').style.display = 'none';
}

function renderAccentPicker() {
  const accents = ['#ff6b35', '#4f8ef7', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#f472b6', '#22d3ee', '#6366f1', '#14b8a6'];
  const cur = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const wrap = document.getElementById('menuAccents');
  if (!wrap) return;
  wrap.innerHTML = accents.map(c =>
    `<div class="accentDot${c === cur ? ' sel' : ''}" style="background:${c}" onclick="pickAccent('${c}')"></div>`
  ).join('');
}

async function pickAccent(c) {
  applyAccent(c);
  if (USER) await sb.from('app_users').update({ accent_color: c }).eq('auth_id', USER.id).catch(() => {});
  renderAccentPicker();
}

function toggleThemeCfg() {
  IS_DARK = !IS_DARK;
  localStorage.setItem('satolina_theme', IS_DARK ? 'dark' : 'light');
  applyTheme();
  // Update menu toggle
  const menuTgl = document.getElementById('menuThemeToggle');
  if (menuTgl) menuTgl.classList.toggle('on', IS_DARK);
  // Update config toggle (inverted: .on = light mode active)
  const cfgTgl = document.getElementById('cfgThemeBtn');
  if (cfgTgl) cfgTgl.classList.toggle('on', !IS_DARK);
  // Refresh config page if visible
  const tabCfg = document.getElementById('tabConfig');
  if (tabCfg && tabCfg.classList.contains('active')) showConfig();
  if (USER) sb.from('app_users').update({ theme: IS_DARK ? 'dark' : 'light' }).eq('auth_id', USER.id).catch(() => {});
}

// ── AUTH ──
async function loginWithGoogle() {
  document.getElementById('loginStatus').textContent = 'Conectando...';
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/compras/' }
  });
  if (error) document.getElementById('loginStatus').textContent = 'Error: ' + error.message;
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = '../';
}

async function initAuth() {
  sb.auth.onAuthStateChange(async (ev, session) => {
    if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && session && !BOOT_DONE) {
      BOOT_DONE = true;
      await onLogin(session);
    } else if (ev === 'INITIAL_SESSION' && !session) {
      document.getElementById('loginScreen').style.display = 'flex';
    } else if (ev === 'SIGNED_OUT') {
      BOOT_DONE = false;
      document.getElementById('app').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
    }
  });
}

async function onLogin(session) {
  USER = session.user;
  const meta = USER.user_metadata || {};
  ROLE = (meta.full_name || meta.name || USER.email.split('@')[0]).split(' ')[0];

  // Upsert user in app_users
  const { data: ex } = await sb.from('app_users').select('*').eq('auth_id', USER.id).maybeSingle();
  if (!ex) {
    await sb.from('app_users').insert({
      auth_id: USER.id, email: USER.email,
      nombre: meta.full_name || meta.name || USER.email,
      nombre_corto: ROLE,
      avatar_url: meta.avatar_url || meta.picture || '',
      accent_color: '#ff6b35', theme: 'dark'
    }).catch(() => {});
  } else {
    if (ex.accent_color) applyAccent(ex.accent_color);
    if (ex.theme) { IS_DARK = ex.theme === 'dark'; applyTheme(); }
    if (ex.nombre_corto) ROLE = ex.nombre_corto;
  }

  // Show app
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Render user avatar in topbar
  const avatarUrl = meta.avatar_url || meta.picture || ex?.avatar_url || '';
  const userBtn = document.getElementById('userBtn');
  if (avatarUrl) {
    userBtn.innerHTML = `<img src="${esc(avatarUrl)}" class="userAvatar" alt="avatar" onclick="toggleMenu()"/>`;
  } else {
    userBtn.innerHTML = `<div class="userInitial" onclick="toggleMenu()">${(ROLE || '?')[0].toUpperCase()}</div>`;
  }

  // Welcome greeting
  document.getElementById('whoLabel').textContent = ROLE;
  const fem = ['caro', 'carolina'].includes(ROLE.toLowerCase());
  flash(`Bienvenid${fem ? 'a' : 'o'}, ${ROLE}!`, 'ok');

  await loadCats();
  loadWeather();
  showHome();
}

// ── CATEGORIAS ──
async function loadCats() {
  const { data } = await sb.from('categorias').select('*').order('orden');
  ALL_CATS = data || [];
}
function getCats() { return ALL_CATS.filter(c => c.modulo === MODULE); }

// ── WEATHER ──
async function loadWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-25.2867&longitude=-57.647&current=temperature_2m,weather_code&timezone=America/Asuncion');
    const d = await r.json();
    const cur = d.current;
    WEATHER_DATA = { temp: Math.round(cur.temperature_2m), code: cur.weather_code };
    document.getElementById('weatherBadge').textContent = `🌡 ${WEATHER_DATA.temp}° ${weatherDesc(cur.weather_code)}`;
  } catch {
    document.getElementById('weatherBadge').textContent = '🌡 --°';
  }
}
function weatherDesc(code) {
  if (code <= 1) return 'despejado';
  if (code <= 3) return 'parcial nublado';
  if (code <= 48) return 'nublado';
  if (code <= 67) return 'lluvia';
  if (code <= 82) return 'lluvia fuerte';
  return 'tormenta';
}

// ── MODULE ──
function switchModule(mod) {
  MODULE = mod;
  document.getElementById('tabSuper').classList.toggle('active', mod === 'super');
  document.getElementById('tabFarmacia').classList.toggle('active', mod === 'farmacia');
  document.getElementById('tabConfig').classList.remove('active');
  if (CUR_LISTA) goBack(); else showHome();
}

// ── NAV ──
function goBack() {
  CUR_LISTA = null; CUR_ITEMS = [];
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('fabBtn').style.display = 'flex';
  showHome();
}

// ── HOME ──
async function showHome() {
  const mc = document.getElementById('mc');
  mc.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">Cargando...</div>';
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('fabBtn').style.display = 'flex';

  const { data: act } = await sb.from('listas').select('*').eq('modulo', MODULE).eq('estado', 'activa').order('created_at', { ascending: false });
  const { data: fin } = await sb.from('listas').select('*').eq('modulo', MODULE).eq('estado', 'finalizada').order('created_at', { ascending: false }).limit(10);

  let h = '<div class="secTitle">Listas activas</div>';
  if (!act || !act.length) {
    h += `<div class="empty"><div class="emptyIcon">🛒</div>No hay listas activas.<br>Creá una nueva con el botón +</div>`;
  } else {
    act.forEach(l => {
      h += `<div class="card" onclick="openLista('${l.id}')">
        <div class="cardHead"><div class="cardTitle">${esc(l.titulo)}</div><span class="badge ok">Activa</span></div>
        <div class="cardMeta">
          <span>${esc(l.tipo)}</span>
          ${l.presupuesto ? '<span>₲ ' + FMT(l.presupuesto) + '</span>' : ''}
          <span>${fmtD(l.created_at)}</span>
          <span>${esc(l.created_by)}</span>
        </div>
      </div>`;
    });
  }

  h += '<div class="secTitle" style="margin-top:24px">Historial</div>';
  if (!fin || !fin.length) {
    h += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:12px">Sin historial</div>';
  } else {
    fin.forEach(l => {
      h += `<div class="card" style="opacity:.55" onclick="openLista('${l.id}')">
        <div class="cardHead"><div class="cardTitle">${esc(l.titulo)}</div><span class="badge dim">Finalizada</span></div>
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

// ── NEW LISTA ──
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
  const { error } = await sb.from('listas').insert({
    id, titulo: t,
    tipo: document.getElementById('nlTp').value,
    modulo: MODULE, estado: 'activa',
    presupuesto: parseInt(document.getElementById('nlP').value) || 0,
    created_by: ROLE
  });
  if (error) { flash(error.message, 'err'); return; }
  closeM('mNL');
  flash('✅ Lista creada');
  openLista(id);
}

// ── OPEN LISTA ──
async function openLista(id) {
  const { data: l } = await sb.from('listas').select('*').eq('id', id).single();
  if (!l) { flash('No encontrada', 'err'); return; }
  CUR_LISTA = l;
  const { data: items } = await sb.from('lista_items').select('*').eq('lista_id', id).order('orden');
  CUR_ITEMS = items || [];
  document.getElementById('backBtn').style.display = 'flex';
  document.getElementById('fabBtn').style.display = 'none';
  renderDetail();
}

// ── RENDER DETAIL ──
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

  let h = `<div style="font-size:15px;font-weight:700;margin-bottom:2px">${esc(l.titulo)}</div>
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
        h += `<div class="checkItem${it.checked ? ' chk' : ''}">
          <div class="ckb" onclick="togCk('${it.id}')">${it.checked ? '✓' : ''}</div>
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
}

// ── SEARCH ──
function onSrch(v) {
  clearTimeout(SEARCH_TO);
  if (v.length < 1) { hideDd(); S_RES = []; return; }
  SEARCH_TO = setTimeout(async () => {
    const q = NORM(v);
    const { data } = await sb.from('productos')
      .select('*')
      .or(`nombre_norm.ilike.%${q}%,tags.ilike.%${q}%`)
      .order('veces_comprado', { ascending: false })
      .limit(8);
    S_RES = data || []; SEL_IDX = 0; renderDd(v);
  }, 120);
}
function renderDd(q) {
  const dd = document.getElementById('sDd'); if (!dd) return;
  if (!S_RES.length) { dd.classList.remove('show'); return; }
  let h = '';
  S_RES.forEach((r, i) => {
    h += `<div class="ddItem${i === SEL_IDX ? ' sel' : ''}" onmousedown="qAdd(${i})" onmouseenter="SEL_IDX=${i};renderDd('${esc(q).replace(/'/g, "\\'")}')">
      <div>
        <div class="ddItem-name">${esc(r.nombre)}</div>
        <div class="ddItem-meta"><span class="ddItem-cat">${esc(r.categoria)}</span>${r.veces_comprado ? '<span>' + r.veces_comprado + 'x</span>' : ''}</div>
      </div>
      ${r.ultimo_precio ? '<span class="ddItem-price">₲' + FMT(r.ultimo_precio) + '</span>' : ''}
    </div>`;
  });
  h += `<div class="ddNew" onmousedown="showNP()">+ Crear "${esc(q)}" como nuevo</div>`;
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

// ── QUICK ADD ──
async function qAdd(idx) {
  const p = S_RES[idx]; if (!p) return;
  hideDd();
  const inp = document.getElementById('sIn'); if (inp) inp.value = ''; S_RES = [];
  const ex = CUR_ITEMS.find(i => i.producto_id === p.id);
  if (ex) {
    ex.cantidad += 1;
    await sb.from('lista_items').update({ cantidad: ex.cantidad }).eq('id', ex.id);
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
    const { error } = await sb.from('lista_items').insert(item);
    if (error) { flash(error.message, 'err'); return; }
    CUR_ITEMS.push(item);
    flash(`✅ ${p.nombre}`);
  }
  renderDetail();
  setTimeout(() => { const i = document.getElementById('sIn'); if (i) i.focus(); }, 100);
}

// ── CHECK ──
async function togCk(id) {
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  it.checked = !it.checked;
  await sb.from('lista_items').update({
    checked: it.checked,
    checked_by: it.checked ? ROLE : '',
    checked_at: it.checked ? new Date().toISOString() : null
  }).eq('id', id);
  renderDetail();
}

// ── QTY ──
async function chgQty(id, d) {
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  it.cantidad = Math.max(1, it.cantidad + d);
  await sb.from('lista_items').update({ cantidad: it.cantidad }).eq('id', id);
  renderDetail();
}

// ── REMOVE ──
async function rmItem(id) {
  CUR_ITEMS = CUR_ITEMS.filter(i => i.id !== id);
  await sb.from('lista_items').delete().eq('id', id);
  flash('🗑 Eliminado'); renderDetail();
}

// ── EDIT ITEM ──
function openEI(id) {
  if (CUR_LISTA.estado !== 'activa') return;
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  document.getElementById('eiId').value = id;
  document.getElementById('eiTitle').textContent = '✏️ ' + it.nombre;
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
  openM('mEI');
}
async function saveEdit() {
  const id = document.getElementById('eiId').value;
  const it = CUR_ITEMS.find(i => i.id === id); if (!it) return;
  const u = {
    categoria: document.getElementById('eiCat').value,
    tamano: document.getElementById('eiTam').value,
    unidad: document.getElementById('eiUn').value,
    marca: document.getElementById('eiMa').value,
    marca_alt: document.getElementById('eiMaA').value,
    precio_estimado: parseInt(document.getElementById('eiPr').value) || 0,
    notas: document.getElementById('eiNo').value
  };
  Object.assign(it, u);
  await sb.from('lista_items').update(u).eq('id', id);
  closeM('mEI'); flash('💾 Guardado'); renderDetail();
}
function delFromEdit() { const id = document.getElementById('eiId').value; closeM('mEI'); rmItem(id); }

// ── NEW PRODUCT ──
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
  await sb.from('productos').insert({
    id, nombre: n, nombre_norm: NORM(n),
    categoria: document.getElementById('npC').value,
    unidad_default: document.getElementById('npU').value,
    tags: n.toLowerCase()
  });
  closeM('mNP');
  S_RES = [{ id, nombre: n, categoria: document.getElementById('npC').value, unidad_default: document.getElementById('npU').value, ultimo_precio: 0, veces_comprado: 0 }];
  await qAdd(0);
}

// ── FINALIZAR ──
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
async function confirmFin() {
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
  await sb.from('listas').update(upd).eq('id', CUR_LISTA.id);

  for (const it of CUR_ITEMS) {
    if (it.checked) {
      await sb.from('historial').insert({
        id: 'h_' + UID(), lista_id: CUR_LISTA.id,
        producto_id: it.producto_id, nombre: it.nombre,
        categoria: it.categoria, cantidad: it.cantidad,
        unidad: it.unidad, tamano: it.tamano,
        marca: it.marca, precio: it.precio_estimado,
        supermercado: sup, usuario: ROLE
      }).catch(() => {});
      if (it.producto_id) {
        await sb.rpc('increment_product_stats', { p_id: it.producto_id, p_precio: it.precio_estimado })
          .catch(() => {
            sb.from('productos').update({ ultimo_precio: it.precio_estimado }).eq('id', it.producto_id).catch(() => {});
          });
      }
    }
  }
  closeM('mFin');
  CUR_LISTA.estado = 'finalizada';
  flash('✅ Compra finalizada y guardada');
  renderDetail();
}

// ── SHARE ──
function showSh() {
  const items = CUR_ITEMS, co = getCats().map(c => c.nombre);
  const gr = {};
  items.filter(i => !i.checked).forEach(i => { if (!gr[i.categoria]) gr[i.categoria] = []; gr[i.categoria].push(i); });
  const sg = Object.entries(gr).sort((a, b) => {
    const ia = co.indexOf(a[0]), ib = co.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
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
function copySh() {
  navigator.clipboard.writeText(document.getElementById('shTxt').textContent);
  closeM('mSh'); flash('📋 Copiado');
}
function sendWA() {
  const t = encodeURIComponent(document.getElementById('shTxt').textContent);
  window.open('https://wa.me/?text=' + t, '_blank');
  closeM('mSh');
}

// ── CONFIG (tab de config — settings inline) ──
function showConfig() {
  document.getElementById('tabSuper').classList.remove('active');
  document.getElementById('tabFarmacia').classList.remove('active');
  document.getElementById('tabConfig').classList.add('active');
  document.getElementById('fabBtn').style.display = 'none';
  document.getElementById('backBtn').style.display = 'none';
  const accents = ['#ff6b35', '#4f8ef7', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#f472b6', '#22d3ee', '#6366f1', '#14b8a6'];
  const cur = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const mc = document.getElementById('mc');
  mc.innerHTML = `
    <div class="secTitle">Preferencias</div>
    <div class="cfgRow">
      <span class="cfgLabel">${IS_DARK ? '🌙 Modo oscuro' : '☀️ Modo claro'}</span>
      <button class="toggleSwitch${IS_DARK ? '' : ' on'}" id="cfgThemeBtn" onclick="toggleThemeCfg()"><span class="toggleKnob"></span></button>
    </div>
    <div class="secTitle">Color de acento</div>
    <div class="accentPick">
      ${accents.map(c => `<div class="accentDot${c === cur ? ' sel' : ''}" style="background:${c}" onclick="pickAccent('${c}');showConfig()"></div>`).join('')}
    </div>
    <div class="secTitle" style="margin-top:24px">Cuenta</div>
    <div class="cfgRow">
      <span class="cfgLabel">${esc(ROLE)}</span>
      <span style="font-size:11px;color:var(--muted)">${esc(USER?.email || '')}</span>
    </div>
    <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
      <a href="../" class="btn">🏠 Ir al Home</a>
      <a href="../finanzas/" class="btn">💰 Ir a Finanzas</a>
    </div>
    <div style="margin-top:12px">
      <button class="btn danger" onclick="logout()">Cerrar sesión</button>
    </div>
    <div style="margin-top:20px;font-family:var(--mono);font-size:9px;letter-spacing:2px;color:var(--dim);text-transform:uppercase">
      satolinapp · compras · v1.1.0
    </div>`;
}

// ── INIT ──
initAuth();
