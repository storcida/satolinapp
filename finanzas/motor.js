/* ============================================================
   PEARS · Hogar Motor
   Sprint 2 — datos reales desde Supabase
   ============================================================ */

let sb, USER, HH_ID;
let MONTH       = '';     // '2026-04'
let TRANSACTIONS = [];
let BUDGET       = 8_000_000;  // Gs. — configurable desde Configuración
const SPLIT      = { Caro: 50, Santi: 50 }; // TODO: desde config

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const FMT = n => new Intl.NumberFormat('es-PY').format(Math.round(n || 0));
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Boot ──────────────────────────────────────────────
Auth.onReady(async user => {
  if (!user) { window.location.href = '/'; return; }
  sb    = Auth.client();
  USER  = user;

  // household_id: intentar desde user, si no → RPC que bypasea la RLS circular
  HH_ID = user.household_id;
  if (!HH_ID) {
    const { data: hhId, error: rpcErr } = await sb.rpc('get_my_household_id');
    if (rpcErr) console.warn('[Hogar] rpc error:', rpcErr.message);
    HH_ID = hhId || null;
  }

  if (!HH_ID) { showErr('Sin household asignado. Contactá al admin.'); return; }

  PearsHeader.init('hogar');

  // Default: mes más reciente con datos
  MONTH = latestMonth();
  await loadMonth(MONTH);
});

function latestMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return `${MONTHS_ES[parseInt(mo)-1].charAt(0).toUpperCase() + MONTHS_ES[parseInt(mo)-1].slice(1)} ${y}`;
}

function prevMonth(m) {
  const d = new Date(m + '-01');
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMonth(m) {
  const d = new Date(m + '-01');
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ── Data loading ──────────────────────────────────────
async function loadMonth(month) {
  setLoading(true);
  MONTH = month;
  updateMonthLabel();

  const { data, error } = await sb
    .from('transactions')
    .select('*')
    .eq('household_id', HH_ID)
    .eq('month', month)
    .order('fecha', { ascending: false });

  setLoading(false);

  if (error) { showErr('Error cargando datos: ' + error.message); return; }
  TRANSACTIONS = data || [];

  renderTablero();
  renderMovimientos();
}

// ── Calculations ──────────────────────────────────────
function calcTotals() {
  const total = TRANSACTIONS.reduce((s, t) => s + Number(t.monto_pyg || 0), 0);
  const porPagador  = {};
  const porFactura  = {};

  TRANSACTIONS.forEach(t => {
    const pag = t.pagador || '—';
    porPagador[pag] = (porPagador[pag] || 0) + Number(t.monto_pyg || 0);
    const fac = t.factura_nombre;
    if (fac && fac !== 'Sin factura' && fac !== '—') {
      porFactura[fac] = (porFactura[fac] || 0) + Number(t.monto_pyg || 0);
    }
  });

  const totalFacturas = Object.values(porFactura).reduce((s,v)=>s+v,0);

  // Categorías
  const porCat = {};
  TRANSACTIONS.forEach(t => {
    const c = t.categoria || 'Sin categoría';
    porCat[c] = (porCat[c] || 0) + Number(t.monto_pyg || 0);
  });

  return { total, porPagador, porFactura, totalFacturas, porCat };
}

function calcConciliacion(totals) {
  const { total, porPagador, porFactura, totalFacturas } = totals;
  const members = ['Caro', 'Santi'];

  // Financiera: quién pagó vs qué le corresponde por %
  const financiera = members.map(m => {
    const pago  = porPagador[m] || 0;
    const pct   = SPLIT[m] || 50;
    const corr  = total * pct / 100;
    const delta = pago - corr; // positivo = pagó de más (acreedor), negativo = pagó de menos (deudor)
    return { nombre: m, pago, corr, delta };
  });

  // Fiscal: facturas a nombre de cada uno vs % correspondiente
  const fiscal = members.map(m => {
    const facturas = porFactura[m] || 0;
    const pct      = SPLIT[m] || 50;
    const corr     = totalFacturas * pct / 100;
    const delta    = facturas - corr;
    return { nombre: m, facturas, corr, delta };
  });

  // Resumen: quién le debe a quién (financiero)
  const acreedor = financiera.find(f => f.delta > 0);
  const deudor   = financiera.find(f => f.delta < 0);
  const deuda    = acreedor ? Math.abs(acreedor.delta) : 0;

  // Resumen fiscal: quién debe conseguir más facturas
  const conMenosFacturas = fiscal.find(f => f.delta < 0);

  return { financiera, fiscal, acreedor, deudor, deuda, conMenosFacturas };
}

// ── Render Tablero ────────────────────────────────────
function renderTablero() {
  const T = calcTotals();
  const C = calcConciliacion(T);
  const remanente = BUDGET - T.total;
  const pctUsado  = Math.min(100, Math.round(T.total / BUDGET * 100));

  // KPIs
  document.getElementById('kpi-total').textContent  = FMT(T.total);
  document.getElementById('kpi-remante').textContent = FMT(Math.abs(remanente));
  document.getElementById('kpi-remante').className   = 'kpi-value' + (remanente >= 0 ? ' ok' : ' err');
  document.getElementById('kpi-rem-sub').textContent = remanente >= 0 ? 'Gs. · remanente' : 'Gs. · sobre presupuesto';

  // Budget bar
  buildWaveform(document.getElementById('hogar-progress'), pctUsado / 100);
  document.getElementById('budget-pct').textContent   = pctUsado + '% utilizado';
  document.getElementById('budget-movs').textContent  = TRANSACTIONS.length + ' movimientos';
  document.getElementById('budget-total').textContent = 'Gs. ' + FMT(BUDGET);

  // Conciliación financiera
  renderConcilFinanciera(C, T.total);

  // Conciliación fiscal
  renderConcilFiscal(C, T.totalFacturas);

  // Categorías
  renderCats(T.porCat, T.total);
}

function renderConcilFinanciera(C, total) {
  const el = document.getElementById('concil-financiera');
  if (!el) return;

  const cards = C.financiera.map(f => {
    const color = f.nombre === 'Caro' ? 'var(--caro)' : 'var(--santi)';
    const sign  = f.delta >= 0 ? '+' : '−';
    const cls   = f.delta >= 0 ? 'pos' : 'neg';
    const label = f.delta >= 0 ? 'Acreedor' : 'Deudor';
    return `
      <div class="balance-card">
        <div class="balance-top">
          <div class="balance-dot" style="background:${color}"></div>
          <div class="balance-name">${f.nombre}</div>
        </div>
        <div class="balance-pago">Pagó</div>
        <div class="balance-amount" style="color:${color}">${FMT(f.pago)}</div>
        <div class="balance-debe">
          <div class="balance-debe-label">Le corresponde (${SPLIT[f.nombre]}%)</div>
          <div style="font-size:13px;color:var(--muted)">${FMT(f.corr)}</div>
        </div>
        <div class="balance-debe" style="margin-top:6px">
          <div class="balance-debe-label">${label}</div>
          <div class="balance-debe-val ${cls}">${sign} ${FMT(Math.abs(f.delta))}</div>
        </div>
      </div>`;
  }).join('');

  const resumen = C.deuda > 0
    ? `<div style="margin-top:10px;padding:10px 12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="color:var(--muted)">${C.deudor?.nombre || '—'} debe transferirle a ${C.acreedor?.nombre || '—'}</span>
        <span style="font-weight:600;color:var(--err)">Gs. ${FMT(C.deuda)}</span>
       </div>`
    : `<div style="margin-top:10px;padding:10px 12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;font-size:12px;color:var(--ok)">✓ Equil­ibrado</div>`;

  el.innerHTML = `<div class="balance-grid">${cards}</div>${resumen}`;
}

function renderConcilFiscal(C, totalFacturas) {
  const el = document.getElementById('concil-fiscal');
  if (!el) return;

  if (totalFacturas === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--dim);padding:8px 0">Sin facturas registradas este mes</div>';
    return;
  }

  const cards = C.fiscal.map(f => {
    const color = f.nombre === 'Caro' ? 'var(--caro)' : 'var(--santi)';
    const sign  = f.delta >= 0 ? '+' : '−';
    const cls   = f.delta >= 0 ? 'pos' : 'neg';
    return `
      <div class="balance-card">
        <div class="balance-top">
          <div class="balance-dot" style="background:${color}"></div>
          <div class="balance-name">${f.nombre}</div>
        </div>
        <div class="balance-pago">Facturas a su nombre</div>
        <div class="balance-amount" style="color:${color}">${FMT(f.facturas)}</div>
        <div class="balance-debe">
          <div class="balance-debe-label">Le corresponde (${SPLIT[f.nombre]}%)</div>
          <div style="font-size:13px;color:var(--muted)">${FMT(f.corr)}</div>
        </div>
        <div class="balance-debe" style="margin-top:6px">
          <div class="balance-debe-label">Balance</div>
          <div class="balance-debe-val ${cls}">${sign} ${FMT(Math.abs(f.delta))}</div>
        </div>
      </div>`;
  }).join('');

  const menor = C.conMenosFacturas;
  const resumen = menor
    ? `<div style="margin-top:10px;padding:10px 12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;font-size:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="color:var(--muted)">${menor.nombre} debe obtener facturas por</span>
        <span style="font-weight:600;color:var(--warn)">Gs. ${FMT(Math.abs(menor.delta))}</span>
       </div>`
    : `<div style="margin-top:10px;padding:10px 12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;font-size:12px;color:var(--ok)">✓ Facturas equilibradas</div>`;

  el.innerHTML = `<div class="balance-grid">${cards}</div>${resumen}`;
}

function renderCats(porCat, total) {
  const el = document.getElementById('cat-list');
  if (!el) return;
  el.innerHTML = '';
  const sorted = Object.entries(porCat).sort((a,b) => b[1]-a[1]);
  sorted.forEach(([cat, monto]) => {
    const pct = total > 0 ? Math.round(monto / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${esc(cat)}</span>
        <span class="cat-amt">Gs. ${FMT(monto)}<span class="cat-pct"> ${pct}%</span></span>
      </div>
      <div id="catbar-${cat.replace(/\s+/g,'-')}"></div>`;
    el.appendChild(row);
    buildWaveform(row.querySelector(`[id^="catbar-"]`), pct / 100);
  });
}

// ── Render Movimientos ────────────────────────────────
function renderMovimientos() {
  const el = document.getElementById('mov-list');
  if (!el) return;

  if (!TRANSACTIONS.length) {
    el.innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--dim);font-size:13px">Sin movimientos este mes</div>';
    return;
  }

  const ico = {
    pencil: `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:  `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  };

  el.innerHTML = TRANSACTIONS.map(t => {
    const badgeCls = t.pagador === 'Caro' ? 'badge-caro' : 'badge-santi';
    const day  = new Date(t.fecha + 'T00:00:00').getDate();
    const mon  = MONTHS_ES[new Date(t.fecha + 'T00:00:00').getMonth()].substring(0,3).toUpperCase();
    return `
      <div class="mov-item">
        <div class="mov-date"><span class="day">${day}</span>${mon}</div>
        <div class="mov-body">
          <div class="mov-concept">${esc(t.lugar || t.item || '—')}</div>
          <div class="mov-meta">
            <span class="mov-cat">${esc(t.categoria || '—')}</span>
            <span class="${badgeCls}"><span class="badge-dot"></span>${esc(t.pagador)}</span>
          </div>
        </div>
        <div class="mov-right">
          <div class="mov-amount">Gs. ${FMT(t.monto_pyg)}</div>
          <div class="mov-banco">${esc(t.banco || '—')}</div>
        </div>
        <div class="mov-actions">
          <button class="mov-action-btn edit" onclick="openEditModal('${t.id}')" title="Editar">${ico.pencil}</button>
          <button class="mov-action-btn del"  onclick="confirmDel('${t.id}')" title="Borrar">${ico.trash}</button>
        </div>
      </div>`;
  }).join('');
}

// ── Month navigation ──────────────────────────────────
function navMonth(dir) {
  loadMonth(dir === -1 ? prevMonth(MONTH) : nextMonth(MONTH));
}

function updateMonthLabel() {
  const el = document.getElementById('month-label');
  if (el) el.textContent = monthLabel(MONTH);
}

// ── CRUD: Crear ───────────────────────────────────────
async function saveMovimiento() {
  const pagador  = document.querySelector('.toggle-btn.active[data-field="pagador"]')?.textContent?.trim() || USER.nombre_corto;
  const benef    = document.querySelector('.toggle-btn.active[data-field="benef"]')?.textContent?.trim() || 'Ambos';
  const monto    = parseInt((document.getElementById('mov-monto')?.value || '0').replace(/\D/g,'')) || 0;
  const fecha    = document.getElementById('mov-fecha')?.value || new Date().toISOString().split('T')[0];
  const cat      = document.getElementById('mov-cat')?.value || '';
  const lugar    = document.getElementById('mov-lugar')?.value?.trim() || '';
  const banco    = document.getElementById('mov-banco')?.value || null;
  const factura  = document.getElementById('mov-factura')?.value || 'Sin factura';
  const nota     = document.getElementById('mov-nota')?.value?.trim() || null;

  if (!monto || !lugar) { flash('Completá monto y lugar', 'warn'); return; }

  const [y, m] = fecha.split('-');
  const month  = `${y}-${m}`;

  const payload = {
    household_id:  HH_ID,
    pagador,
    beneficiario:  benef,
    lugar,
    categoria:     cat,
    monto:         monto,
    monto_pyg:     monto,
    moneda:        'guaranies',
    banco:         banco || null,
    factura_nombre: factura,
    nota,
    fecha,
    month,
    created_by:    USER.nombre_corto || USER.nombre,
    updated_by:    USER.nombre_corto || USER.nombre,
  };

  const { error } = await sb.from('transactions').insert(payload);
  if (error) { flash('Error: ' + error.message, 'err'); return; }

  flash('Movimiento guardado ✓', 'ok');
  modalClose();
  await loadMonth(MONTH);
}

// ── CRUD: Eliminar ────────────────────────────────────
async function confirmDel(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  const { error } = await sb.from('transactions').delete().eq('id', id);
  if (error) { flash('Error al eliminar', 'err'); return; }
  flash('Eliminado', 'ok');
  await loadMonth(MONTH);
}

// ── CRUD: Editar ──────────────────────────────────────
function openEditModal(id) {
  const t = TRANSACTIONS.find(x => x.id === id);
  if (!t) return;

  document.getElementById('edit-id').value    = id;
  document.getElementById('edit-monto').value = FMT(t.monto_pyg);
  document.getElementById('edit-fecha').value = t.fecha;
  document.getElementById('edit-cat').value   = t.categoria || '';
  document.getElementById('edit-lugar').value = t.lugar || '';
  document.getElementById('edit-banco').value = t.banco || '';
  document.getElementById('edit-factura').value = t.factura_nombre || 'Sin factura';
  document.getElementById('edit-nota').value  = t.nota || '';

  // Set pagador toggle
  document.querySelectorAll('[data-field="edit-pagador"]').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === t.pagador);
  });

  document.getElementById('modal-edit').classList.add('open');
}

async function saveEdit() {
  const id      = document.getElementById('edit-id').value;
  const pagador = document.querySelector('.toggle-btn.active[data-field="edit-pagador"]')?.textContent?.trim();
  const monto   = parseInt((document.getElementById('edit-monto').value || '0').replace(/\D/g,'')) || 0;
  const fecha   = document.getElementById('edit-fecha').value;
  const cat     = document.getElementById('edit-cat').value;
  const lugar   = document.getElementById('edit-lugar').value.trim();
  const banco   = document.getElementById('edit-banco').value;
  const factura = document.getElementById('edit-factura').value;
  const nota    = document.getElementById('edit-nota').value.trim();

  const [y, m] = fecha.split('-');

  const { error } = await sb.from('transactions').update({
    pagador, monto, monto_pyg: monto, fecha, categoria: cat,
    lugar, banco: banco || null, factura_nombre: factura,
    nota: nota || null, month: `${y}-${m}`,
    updated_by: USER.nombre_corto || USER.nombre,
  }).eq('id', id);

  if (error) { flash('Error: ' + error.message, 'err'); return; }
  flash('Guardado ✓', 'ok');
  document.getElementById('modal-edit').classList.remove('open');
  await loadMonth(MONTH);
}

// ── Waveform ──────────────────────────────────────────
function buildWaveform(el, pct) {
  if (!el) return;
  const TOTAL = 48, filled = Math.round(TOTAL * Math.min(pct, 1));
  el.className = 'waveform';
  el.innerHTML = '';
  for (let i = 0; i < TOTAL; i++) {
    if (i === filled) { const h = document.createElement('div'); h.className = 'wf-head'; el.appendChild(h); }
    const t = document.createElement('div');
    t.className = 'wf-tick' + (i < filled ? '' : ' empty');
    el.appendChild(t);
  }
}

// ── Helpers ───────────────────────────────────────────
function setLoading(on) {
  const mc = document.getElementById('tablero-content');
  if (mc) mc.style.opacity = on ? '.4' : '1';
}

function showErr(msg) {
  const el = document.getElementById('tablero-content');
  if (el) el.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--err);font-size:13px">${msg}</div>`;
}

function flash(msg, type = 'ok') {
  const wrap = document.getElementById('flash-wrap');
  if (!wrap) return;
  const colors = { ok:'#22c55e', err:'#ef4444', warn:'#F59E0B', info:'#60a5fa' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#111;border:1px solid ${colors[type]||colors.ok};color:${colors[type]||colors.ok};padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:300;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.5);`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function setToggle(btn) {
  btn.closest('.toggle-row').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function modalOpen()  { document.getElementById('modal-overlay').classList.add('open'); }
function modalClose() { document.getElementById('modal-overlay').classList.remove('open'); }
