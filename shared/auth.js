/* ============================================
   PEARS — auth.js v3.0
   Lógica de autenticación centralizada.
   Incluir en todos los módulos ANTES que
   cualquier otro script.
   ============================================ */

const SUPABASE_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';

/* ── Cliente Supabase ── */
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: false }
});

/* ── Estado interno ── */
let _user     = null;
let _session  = null;
let _ready    = false;
const _queue  = [];

/* ── API pública ── */
const Auth = {

  /* Iniciar sesión con Google */
  async login() {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) console.error('[Auth] login error:', error.message);
  },

  /* Cerrar sesión */
  async logout() {
    await _sb.auth.signOut();
    _user = null;
    _session = null;
    window.location.href = '/';
  },

  /* Usuario actual (null si no está logueado) */
  getUser()    { return _user; },
  getSession() { return _session; },
  isReady()    { return _ready; },

  /* Ejecutar callback cuando auth esté listo */
  onReady(fn) {
    if (_ready) { fn(_user); return; }
    _queue.push(fn);
  },

  /* Cliente Supabase (para queries) */
  client() { return _sb; }
};

/* ── Inicialización ── */
(async () => {
  try {
    // 1. Intentar recuperar sesión del hash (callback OAuth)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const { data, error } = await _sb.auth.getSessionFromUrl();
      if (!error && data?.session) {
        _session = data.session;
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    // 2. Recuperar sesión existente
    if (!_session) {
      const { data } = await _sb.auth.getSession();
      _session = data?.session ?? null;
    }

    // 3. Extraer usuario del JWT
    if (_session) {
      const jwt   = _session.access_token;
      const parts = jwt.split('.');
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

      _user = {
        id:     _session.user.id,
        email:  payload.email,
        nombre: payload.name  ?? payload.email.split('@')[0],
        avatar: payload.picture ?? null
      };

      // 4. Sincronizar con app_users
      await _syncUser(_user);
    }

  } catch (e) {
    console.error('[Auth] init error:', e);
  } finally {
    // 5. Notificar a todos los listeners
    _ready = true;
    _queue.forEach(fn => fn(_user));
    _queue.length = 0;
  }
})();

/* ── Sync usuario en app_users ── */
async function _syncUser(user) {
  try {
    const { error } = await _sb
      .from('app_users')
      .upsert({
        id:         user.id,
        email:      user.email,
        nombre:     user.nombre,
        avatar_url: user.avatar,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) console.warn('[Auth] sync user warning:', error.message);
  } catch (e) {
    console.warn('[Auth] sync user error:', e);
  }
}