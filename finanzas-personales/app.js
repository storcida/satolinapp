// ===============================================
// FINANZAS PERSONALES - APP.JS (FIXED)
// ===============================================

const SUPABASE_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';

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

  try {
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
  } catch (err) {
    console.error('Auth init error:', err);
    authLoading.style.display = 'none';
    loginScreen.style.display = 'flex';
    alert('Error al inicializar autenticación: ' + err.message);
  }
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
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Failed to get user');
  return await res.json();
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
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
  const userName = USER.user_metadata?.full_name || USER.email;
  document.getElementById('userName').textContent = userName;
  
  const avatarEl = document.getElementById('userAvatar');
  if (USER.user_metadata?.avatar_url) {
    avatarEl.src = USER.user_metadata.avatar_url;
  } else {
    avatarEl.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%23a78bfa" width="40" height="40" rx="20"/><text x="20" y="26" text-anchor="middle" fill="white" font-size="18" font-family="sans-serif">${userName[0]}</text></svg>`;
  }

  // Setup tabs and load data
  setupTabs();
  setupUserMenu();
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
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;
      window.location.href = authUrl;
    });
  }

  // Init auth
  initAuth();
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
    if (userDropdown) userDropdown.style.display = 'none';
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      const token = localStorage.getItem('sb_access_token');
      if (token) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY }
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.clear();
    window.location.href = '../index.html';
  });

  backBtn?.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
}

// ===============================================
// SUPABASE FETCH
// ===============================================

async function sbFetch(path, options = {}) {
  const token = localStorage.getItem('sb_access_token');
  const headers = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('Supabase error:', error);
    throw new Error(`Supabase error: ${res.status} - ${error}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ===============================================
// DASHBOARD
// ===============================================

async function loadDashboard() {
  try {
    // Show loading state
    document.getElementById('cajaAhorroMonto').textContent = 'Cargando...';
    document.getElementById('ctaCorMonto').textContent = 'Cargando...';
    document.getElementById('tarjetaDeuda').textContent = 'Cargando...';

    // Load cuentas
    CUENTAS = await sbFetch(`cuentas_personales?usuario=eq.${USER.email}&select=*`) || [];
    
    // Load movimientos
    MOVIMIENTOS = await sbFetch(`finanzas_personales?usuario=eq.${USER.email}&select=*&order=fecha.desc`) || [];

    // Calculate and display
    const cajaAhorro = CUENTAS.find(c => c.tipo === 'caja_ahorro');
    const ctaCorriente = CUENTAS.find(c => c.tipo === 'cta_corriente');
    const tarjeta = CUENTAS.find(c => c.tipo === 'tarjeta');

    document.getElementById('cajaAhorroMonto').textContent = `Gs. ${FMT(cajaAhorro?.saldo_actual || 0)}`;
    document.getElementById('ctaCorMonto').textContent = `Gs. ${FMT(ctaCorriente?.saldo_actual || 0)}`;
    document.getElementById('tarjetaDeuda').textContent = `Deuda: Gs. ${FMT(tarjeta?.saldo_actual || 0)}`;

    if (tarjeta) {
      const pagoMin = Math.round((tarjeta.saldo_actual || 0) * 0.2);
      document.getElementById('tarjetaPagoMin').textContent = `Pago mínimo: Gs. ${FMT(pagoMin)}`;
      document.getElementById('tarjetaCierre').textContent = tarjeta.dia_cierre ? `Próximo cierre: ${tarjeta.dia_cierre}` : 'Próximo cierre: -';
    }

    // Calculate KPIs
    const thisMonth = new Date().toISOString().slice(0, 7);
    const movsMes = MOVIMIENTOS.filter(m => m.fecha?.startsWith(thisMonth));
    
    const ingresos = movsMes.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + (m.monto || 0), 0);
    const gastos = movsMes.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + (m.monto || 0), 0);
    const balance = ingresos - gastos;
    const tasaAhorro = ingresos > 0 ? Math.round((balance / ingresos) * 100) : 0;

    const patrimonio = (cajaAhorro?.saldo_actual || 0) + (ctaCorriente?.saldo_actual || 0) - (tarjeta?.saldo_actual || 0);

    document.getElementById('kpiPatrimonio').textContent = `Gs. ${FMT(patrimonio)}`;
    document.getElementById('kpiIngresos').textContent = `Gs. ${FMT(ingresos)}`;
    document.getElementById('kpiGastos').textContent = `Gs. ${FMT(gastos)}`;
    document.getElementById('kpiBalance').textContent = `Gs. ${FMT(balance)}`;
    document.getElementById('kpiTasaAhorro').textContent = `${tasaAhorro}%`;

  } catch (err) {
    console.error('Error loading dashboard:', err);
    alert('⚠️ Error al cargar datos:\n\n' + err.message + '\n\n¿Aplicaste las RLS policies manualmente en Supabase?');
    
    // Show error state
    document.getElementById('cajaAhorroMonto').textContent = 'Error';
    document.getElementById('ctaCorMonto').textContent = 'Error';
    document.getElementById('tarjetaDeuda').textContent = 'Error';
  }
}

// Stubs for other tabs
function loadLedger() {
  console.log('Ledger tab - coming soon');
}

function loadCuentas() {
  console.log('Cuentas tab - coming soon');
}

function loadConfig() {
  console.log('Config tab - coming soon');
}
