// PEARS · shared/logger.js
// Usage: Logger.error('hogar', 'SAVE_FAILED', 'Error al guardar', { detail })
//        Logger.warn('viajes', 'LOAD_SLOW', 'Carga lenta')
//        Logger.info('compras', 'LISTA_CREATED', 'Lista creada')

(function() {
  var SB_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
  var SB_KEY = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';

  function getToken() {
    try {
      var raw = localStorage.getItem('sb-hahhmpvfyrmwnaqxibvt-auth-token');
      return raw ? JSON.parse(raw)?.access_token : null;
    } catch { return null; }
  }

  function getUserEmail() {
    try {
      var raw = localStorage.getItem('sb-hahhmpvfyrmwnaqxibvt-auth-token');
      return raw ? JSON.parse(raw)?.user?.email : null;
    } catch { return null; }
  }

  function send(level, module, event, message, details) {
    try {
      var tok   = getToken();
      var email = getUserEmail();
      var payload = {
        level:      level,
        module:     module,
        event:      event,
        message:    String(message || '').substring(0, 500),
        details:    details || null,
        user_email: email,
        url:        window.location.href,
        user_agent: navigator.userAgent.substring(0, 200)
      };
      var headers = {
        'apikey':       SB_KEY,
        'Content-Type': 'application/json',
        'Prefer':       'return=minimal'
      };
      if (tok) headers['Authorization'] = 'Bearer ' + tok;

      fetch(SB_URL + '/rest/v1/audit_logs', {
        method:  'POST',
        headers: headers,
        body:    JSON.stringify(payload),
        keepalive: true
      }).catch(function() {}); // fire and forget, never throw
    } catch(e) {
      // logger must never break the app
    }
  }

  window.Logger = {
    error: function(module, event, message, details) { send('error',  module, event, message, details); },
    warn:  function(module, event, message, details) { send('warn',   module, event, message, details); },
    info:  function(module, event, message, details) { send('info',   module, event, message, details); },

    // Call this to auto-capture all window.onerror + unhandledrejection
    init: function(module) {
      var mod = module || 'unknown';
      window.addEventListener('error', function(e) {
        send('error', mod, 'JS_ERROR', e.message, {
          source: e.filename, line: e.lineno, col: e.colno,
          stack: e.error ? String(e.error.stack).substring(0, 500) : null
        });
      });
      window.addEventListener('unhandledrejection', function(e) {
        var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled rejection';
        send('error', mod, 'UNHANDLED_REJECTION', msg, {
          stack: e.reason?.stack ? String(e.reason.stack).substring(0, 500) : null
        });
      });
    }
  };
})();
