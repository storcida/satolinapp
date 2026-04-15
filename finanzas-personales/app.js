// ===============================================
// FINANZAS PERSONALES - APP.JS
// ===============================================

const SUPABASE_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhaGhtcHZmeXJtd25hcXhpYnZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM3NzA4NTEsImV4cCI6MjA0OTM0Njg1MX0.kf5VYhCHXHq7WI5HQIFPnzD7N4UPCNlJJcglO0QRlbk';
const GOOGLE_CLIENT_ID = '682693487946-lnafuud97g7h7pmv7jcdvapiimr5liit.apps.googleusercontent.com';

// State global
let USER = null;
let CUENTAS = [];
let MOVIMIENTOS = [];
let CONFIG = null;

// ===============================================
// UTILS
// ===============================================

const FMT = n => new Intl.NumberFormat('es-PY').format(n || 0);
const UID = () => crypto.randomUUID().substring(0, 12);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Formato número input
function formatNumber(val) {
  const num = String(val).replace(/\D/g, '');
  return num ? new Intl.NumberFormat('es-PY').format(num) : '';
}

function clearFormat(val) {
  return String(val).replace(/\./g, '');
}

function parseNum(val) {
  const cleaned = clearFormat(val);
  return cleaned ? parseInt(cleaned, 10) : 0;
}

// ===============================================
// AUTH
// ===============================================

async function initAuth() {
  const authLoading = document.getElementById('authLoading');
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');

  // Check OAuth callback
  const hash = window.location.hash;
  if (hash.includes('access_token')) {
    await handleOAuthCallback(hash);
    return;
  }

  // Check existing session
  const accessToken = localStorage.getItem('sb_access_token');
  const refreshToken = localStorage.getItem('sb_refresh_token');

  if (accessToken && refreshToken) {
    try {
      const user = await refreshSession(refreshToken);
      if (user) {
        USER = user;
        showApp();
        return;
      }
    } catch (err) {
      console.error('Session refresh failed:', err);
      localStorage.clear();
    }
  }

  // Show login
  authLoading.style.display = 'none';
  loginScreen.style.display = 'flex';
}

async function handleOAuthCallback(hash) {
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    showError('Error de autenticación');
    return;
  }

  localStorage.setItem('sb_access_token', accessToken);
  localStorage.setItem('sb_refresh_token', refreshToken);

  const user = await getCurrentUser(accessToken);
  if (user) {
    USER = user;
    window.location.hash = '';
    showApp();
  }
}

async function getCurrentUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  });
  if (!res.ok) throw new Error('Failed to get user');
  return await res.json();
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!res.ok) throw new Error('Refresh failed');
  const data = await res.json();
  
  localStorage.setItem('sb_access_token', data.access_token);
  localStorage.setItem('sb_refresh_token', data.refresh_token);
  
  return data.user;
}

function showApp() {
  document.getElementById('authLoading').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Setup UI
  document.getElementById('userName').textContent = USER.user_metadata?.full_name || USER.email;
  document.getElementById('userAvatar').src = USER.user_metadata?.avatar_url || '';

  // Load data
  loadDashboard();
}

function showError(msg) {
  alert(msg);
  document.getElementById('authLoading').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// ===============================================
// GOOGLE LOGIN
// ===============================================

document.addEventListener('DOMContentLoaded', () => {
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
      const redirectUri = window.location.origin + window.location.pathname;
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
        `&redirect_to=${encodeURIComponent(redirectUri)}`;
      window.location.href = authUrl;
    });
  }
});

// ===============================================
// TABS NAVIGATION
// ===============================================

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      tabContents.forEach(content => {
        content.style.display = 'none';
      });

      const targetContent = document.getElementById(`${targetTab}Tab`);
      if (targetContent) {
        targetContent.style.display = 'block';
      }

      // Load data for specific tabs
      if (targetTab === 'ledger') loadLedger();
      if (targetTab === 'cuentas') loadCuentas();
      if (targetTab === 'config') loadConfig();
    });
  });
}

// ===============================================
// USER DROPDOWN
// ===============================================

function setupUserMenu() {
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');
  const backBtn = document.getElementById('backBtn');

  userMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', () => {
    userDropdown.style.display = 'none';
  });

  logoutBtn?.addEventListener('click', () => {
    localStorage.clear();
    window.location.reload();
  });

  backBtn?.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
}

// ===============================================
// DASHBOARD
// ===============================================

async function loadDashboard() {
  try {
    await Promise.all([
      fetchCuentas(),
      fetchMovimientos(),
      fetchConfig()
    ]);

    renderCuentasCards();
    renderKPIs();
    renderCharts();
  } catch (err) {
    console.error('Error loading dashboard:', err);
    showError('Error cargando datos');
  }
}

async function fetchCuentas() {
  const token = localStorage.getItem('sb_access_token');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cuentas_personales?usuario=eq.${USER.email}&select=*`,
    { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
  );
  if (!res.ok) throw new Error('Failed to fetch cuentas');
  CUENTAS = await res.json();
}

async function fetchMovimientos() {
  const token = localStorage.getItem('sb_access_token');
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/finanzas_personales?usuario=eq.${USER.email}&fecha=gte.${firstDay}&select=*&order=fecha.desc`,
    { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
  );
  if (!res.ok) throw new Error('Failed to fetch movimientos');
  MOVIMIENTOS = await res.json();
}

async function fetchConfig() {
  const token = localStorage.getItem('sb_access_token');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/distribucion_config?usuario=eq.${USER.email}&select=*`,
    { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
  );
  if (!res.ok) throw new Error('Failed to fetch config');
  const data = await res.json();
  CONFIG = data[0] || null;
}

function renderCuentasCards() {
  const cajaAhorro = CUENTAS.find(c => c.tipo === 'caja_ahorro') || { saldo_actual: 0 };
  const ctaCorriente = CUENTAS.find(c => c.tipo === 'cta_corriente') || { saldo_actual: 0 };
  const tarjeta = CUENTAS.find(c => c.tipo === 'tarjeta') || { saldo_actual: 0, limite_credito: 0, dia_cierre: 0 };
  const deudas = CUENTAS.filter(c => c.tipo === 'deuda');
  const totalDeudas = deudas.reduce((sum, d) => sum + parseFloat(d.saldo_actual || 0), 0);

  document.getElementById('cajaAhorroMonto').textContent = `Gs. ${FMT(cajaAhorro.saldo_actual)}`;
  document.getElementById('ctaCorMonto').textContent = `Gs. ${FMT(ctaCorriente.saldo_actual)}`;
  document.getElementById('tarjetaDeuda').textContent = `Deuda: Gs. ${FMT(Math.abs(tarjeta.saldo_actual))}`;
  document.getElementById('tarjetaPagoMin').textContent = `Pago mínimo: Gs. ${FMT(Math.abs(tarjeta.saldo_actual) * 0.2)}`;
  document.getElementById('tarjetaCierre').textContent = `Próximo cierre: ${tarjeta.dia_cierre || '-'}`;
  document.getElementById('deudasTotal').textContent = `Total: Gs. ${FMT(totalDeudas)}`;
}

function renderKPIs() {
  const cajaAhorro = CUENTAS.find(c => c.tipo === 'caja_ahorro') || { saldo_actual: 0 };
  const ctaCorriente = CUENTAS.find(c => c.tipo === 'cta_corriente') || { saldo_actual: 0 };
  const tarjeta = CUENTAS.find(c => c.tipo === 'tarjeta') || { saldo_actual: 0 };
  const deudas = CUENTAS.filter(c => c.tipo === 'deuda');
  const totalDeudas = deudas.reduce((sum, d) => sum + parseFloat(d.saldo_actual || 0), 0);

  const patrimonio = parseFloat(cajaAhorro.saldo_actual) + parseFloat(ctaCorriente.saldo_actual) - 
                     Math.abs(parseFloat(tarjeta.saldo_actual)) - totalDeudas;

  const ingresos = MOVIMIENTOS.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + parseFloat(m.monto), 0);
  const gastos = MOVIMIENTOS.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + parseFloat(m.monto), 0);
  const balance = ingresos - gastos;
  const tasaAhorro = ingresos > 0 ? ((balance / ingresos) * 100).toFixed(1) : 0;

  document.getElementById('kpiPatrimonio').textContent = `Gs. ${FMT(patrimonio)}`;
  document.getElementById('kpiIngresos').textContent = `Gs. ${FMT(ingresos)}`;
  document.getElementById('kpiGastos').textContent = `Gs. ${FMT(gastos)}`;
  document.getElementById('kpiBalance').textContent = `Gs. ${FMT(balance)}`;
  document.getElementById('kpiBalance').className = balance >= 0 ? 'kpi-value ok' : 'kpi-value err';
  document.getElementById('kpiTasaAhorro').textContent = `${tasaAhorro}%`;
}

function renderCharts() {
  // Placeholder - implementar con Chart.js en siguiente fase
  console.log('Charts placeholder');
}

// ===============================================
// LEDGER
// ===============================================

async function loadLedger() {
  // TODO: Implementar en siguiente fase
  console.log('Ledger tab loaded');
}

// ===============================================
// CUENTAS
// ===============================================

async function loadCuentas() {
  // TODO: Implementar en siguiente fase
  console.log('Cuentas tab loaded');
}

// ===============================================
// CONFIG
// ===============================================

async function loadConfig() {
  if (!CONFIG) return;

  document.getElementById('configTipoIngreso').value = CONFIG.tipo_ingreso;
  document.getElementById('configPctIva').value = CONFIG.pct_iva;
  document.getElementById('configPctIrp').value = CONFIG.pct_irp;
  document.getElementById('configPctFijos').value = CONFIG.pct_fijos;
  document.getElementById('configPctDiscrecional').value = CONFIG.pct_discrecional;
  document.getElementById('configPctAhorro').value = CONFIG.pct_ahorro;
}

// ===============================================
// INIT
// ===============================================

window.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  
  if (USER) {
    setupTabs();
    setupUserMenu();
  }
});
