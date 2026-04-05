/* ═══════════════════════════════════════════
   SATOLINA AUDIT LOGGER — audit.js
   Include en cada módulo para logging automático
═══════════════════════════════════════════ */
(function(){
  const SB_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
  const SB_KEY = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';
  const MODULE = document.title.toLowerCase().includes('compras') ? 'compras'
               : document.title.toLowerCase().includes('finanzas') ? 'finanzas'
               : document.title.toLowerCase().includes('viajes') ? 'viajes'
               : 'home';

  function getEmail() {
    try {
      const tok = localStorage.getItem('sb_access_token');
      if (!tok) return null;
      const payload = JSON.parse(atob(tok.split('.')[1]));
      return payload.email || null;
    } catch { return null; }
  }

  window.auditLog = async function(level, event, message, details) {
    try {
      const body = {
        user_email: getEmail(),
        module: MODULE,
        level: level,
        event: event,
        message: String(message || '').substring(0, 500),
        details: details || null,
        url: location.pathname,
        user_agent: navigator.userAgent.substring(0, 200)
      };
      await fetch(SB_URL + '/rest/v1/audit_logs', {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body)
      });
    } catch(e) { /* never fail silently */ }
  };

  // Auto-capture JS errors
  window.addEventListener('error', function(e) {
    auditLog('error', 'js.error', e.message, {
      file: e.filename, line: e.lineno, col: e.colno,
      stack: e.error ? String(e.error.stack || '').substring(0, 800) : null
    });
  });

  // Auto-capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    auditLog('error', 'js.unhandled_rejection',
      e.reason ? String(e.reason.message || e.reason).substring(0, 300) : 'Unhandled rejection',
      { stack: e.reason && e.reason.stack ? String(e.reason.stack).substring(0, 800) : null }
    );
  });

  // Log navigation
  auditLog('info', 'nav.load', 'Module loaded', { referrer: document.referrer || null });
})();
