/* ============================================
   PEARS — auth.js v4.1
   ============================================ */

const SUPABASE_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession:     true,
    autoRefreshToken:   true
  }
});

let _user    = null;
let _session = null;
let _ready   = false;
const _queue = [];

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
    const { data, error } = await _sb.auth.getSession();

    if (!error && data?.session) {
      _session = data.session;
      const authUser = data.session.user;
      const meta     = authUser.user_metadata || {};

      // Buscar el registro real en app_users por auth_id
      const { data: appUser, error: dbErr } = await _sb
        .from('app_users')
        .select('id, nombre, nombre_corto, avatar_url, accent_color, email')
        .eq('auth_id', authUser.id)
        .single();

      if (dbErr || !appUser) {
        console.warn('[Auth] app_users not found for auth_id:', authUser.id);
        _user = {
          id: null, auth_id: authUser.id, email: authUser.email,
          nombre: meta.full_name || meta.name || authUser.email.split('@')[0],
          avatar: meta.avatar_url || meta.picture || null,
          accent_color: null, household_id: null,
        };
      } else {
        // Buscar household via RPC (bypasea RLS circular)
        const { data: hhId } = await _sb.rpc('get_my_household_id');

        _user = {
          id:           appUser.id,
          auth_id:      authUser.id,
          email:        appUser.email || authUser.email,
          nombre:       appUser.nombre,
          nombre_corto: appUser.nombre_corto,
          avatar:       appUser.avatar_url || meta.avatar_url || meta.picture || null,
          accent_color: appUser.accent_color,
          household_id: hhId || null,
          rol:          null,
        };
      }

      // Limpiar hash de OAuth si vino del callback
      if (window.location.hash?.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

  } catch (e) {
    console.error('[Auth] init error:', e);
  } finally {
    _ready = true;
    _queue.forEach(fn => fn(_user));
    _queue.length = 0;
  }
})();
