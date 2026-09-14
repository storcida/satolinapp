/* ============================================
   PEARS — modules.js
   Fuente unica de verdad de los modulos de la app.

   Para apagar o encender un modulo, cambiar `enabled` aca. Nada mas.
   - enabled:false  -> desaparece del menu Y bloquea el acceso por URL directa
   - Los datos NO se tocan: apagar es de interfaz, la tabla sigue intacta.
   ============================================ */

const Modules = {

  ALL: [
    { id: 'compras',   label: 'Compras',   path: '/compras/',             enabled: true  },
    { id: 'hogar',     label: 'Hogar',     path: '/finanzas/',            enabled: true  },
    { id: 'viajes',    label: 'Viajes',    path: '/viajes/',              enabled: true  },
    { id: 'prestamos', label: 'Préstamos', path: '/prestamos/',           enabled: false },
    { id: 'personal',  label: 'Personal',  path: '/finanzas-personales/', enabled: false },
  ],

  // Solo los encendidos, para pintar navegacion
  active() { return this.ALL.filter(m => m.enabled); },

  isEnabled(id) {
    const m = this.ALL.find(x => x.id === id);
    return !!(m && m.enabled);
  },

  // Guardia de ruta: se llama al inicio de un modulo apagado.
  // Sin esto, esconder el link del menu no impide entrar escribiendo la URL.
  guard(id) {
    if (this.isEnabled(id)) return true;
    const m = this.ALL.find(x => x.id === id);
    document.documentElement.innerHTML =
      '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px">' +
      '<div><div style="font-size:15px;font-weight:600;margin-bottom:8px">' +
      (m ? m.label : 'Este módulo') + ' está desactivado</div>' +
      '<div style="font-size:13px;color:#a1a1aa;margin-bottom:20px;line-height:1.5">' +
      'Se apagó temporalmente.<br>Tus datos siguen guardados.</div>' +
      '<a href="/" style="color:#8dd900;font-size:13px;text-decoration:none">← Volver al inicio</a>' +
      '</div></body>';
    return false;
  }
};

if (typeof window !== 'undefined') window.Modules = Modules;
