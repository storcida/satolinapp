/* ============================================
   PEARS — auth.js v4.0
   ============================================ */

const SUPABASE_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';

/* ── Cliente Supabase ── */
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    detectSessionInUrl: true,   // SDK procesa el hash de OAuth automáticamente
    persistSession:     true,
    autoRefreshToken:   true
  }
});

/* ── Estado interno ── */
let _user    = null;
let _session = null;
let _ready   = false;
const _queue = [];

/* ── API pública ── */
const Auth = {

  async login() {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/',
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) console.error('[Auth] login error:', error.message);
  },

  async logout() {
    await _sb.auth.signOut();
    _user = null; _session = null;
    window.location.href = '/';
  },

  getUser()    { return _user; },
  getSession() { return _session; },
  isReady()    { return _ready; },
  client()     { return _sb; },

  onReady(fn) {
    if (_ready) { fn(_user); return; }
    _queue.push(fn);
  }
};

/* ── Inicialización ── */
(async () => {
  try {
    // getSession() maneja automáticamente el hash de OAuth si está presente
    const { data, error } = await _sb.auth.getSession();

    if (error) {
      console.warn('[Auth] getSession error:', error.message);
    } else if (data?.session) {
      _session = data.session;
      const u = data.session.user;
      const meta = u.user_metadata || {};

      _user = {
        id:     u.id,
        email:  u.email,
        nombre: meta.full_name || meta.name || u.email.split('@')[0],
        avatar: meta.avatar_url || meta.picture || null
      };

      // Limpiar hash de la URL si vino del callback OAuth
      if (window.location.hash?.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      // Sync en background, no bloquea
      _syncUser(_user).catch(() => {});
    }

  } catch (e) {
    console.error('[Auth] init error:', e);
  } finally {
    _ready = true;
    _queue.forEach(fn => fn(_user));
    _queue.length = 0;
  }
})();

async function _syncUser(user) {
  try {
    await _sb.from('app_users').upsert({
      id:         user.id,
      email:      user.email,
      nombre:     user.nombre,
      avatar_url: user.avatar,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[Auth] sync warning:', e.message);
  }
}
