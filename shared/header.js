/* ============================================================
   PEARS — header.js  ·  LOCKED COMPONENT
   H1 (PEARS + avatar) + slide-in menu, idénticos en todos
   los módulos. Cambiar aquí = cambia en todas partes.

   Uso en cada módulo:
     <script src="../shared/header.js"></script>
     <script> PearsHeader.init('moduleId'); </script>

   IDs válidos: compras | hogar | viajes | prestamos
                personal | configuracion | home
   ============================================================ */

const PearsHeader = (() => {

  /* ── Config ─────────────────────────────────── */
  const MODULES = [
    { id:'compras',       label:'Compras',       url:'/compras/'              },
    { id:'hogar',         label:'Hogar',         url:'/finanzas/'             },
    { id:'viajes',        label:'Viajes',        url:'/viajes/'               },
    { id:'prestamos',     label:'Préstamos',     url:'/prestamos/'            },
    { id:'personal',      label:'Personal',      url:'/finanzas-personales/'  },
    { id:'configuracion', label:'Configuración', url:'/configuracion/'        },
    { id:'audit',         label:'Audit Log',     url:'/audit/'                },
  ];

  /* ── Internal state ── */
  let _module = 'home';
  let _user   = null;

  /* ── Public API ─────────────────────────────── */
  function init(moduleId) {
    _module = moduleId || 'home';
    _injectH1();
    _injectMenu();

    // Wire auth if available
    if (typeof Auth !== 'undefined') {
      Auth.onReady(user => {
        _user = user;
        if (user) _populateUser(user);
      });
    } else {
      // Mockup fallback — show placeholder
      _setAvatarInitial('S');
    }
  }

  function toggle() {
    const open = document.getElementById('pears-menu').classList.contains('open');
    open ? close() : open_();
  }
  function open_() {
    document.getElementById('pears-menu').classList.add('open');
    document.getElementById('pears-overlay').classList.add('open');
  }
  function close() {
    document.getElementById('pears-menu').classList.remove('open');
    document.getElementById('pears-overlay').classList.remove('open');
  }

  /* ── Private ─────────────────────────────────── */

  function _injectH1() {
    // Remove any existing h1 with id pears-h1
    document.getElementById('pears-h1')?.remove();

    const h1 = document.createElement('header');
    h1.id = 'pears-h1';
    h1.innerHTML = `
      <span id="pears-h1-logo">PEARS</span>
      <div id="pears-avatar" onclick="PearsHeader.toggle()">
        <span id="pears-avatar-initial"></span>
      </div>`;

    // Insert as first child of body
    document.body.insertBefore(h1, document.body.firstChild);
  }

  function _injectMenu() {
    document.getElementById('pears-overlay')?.remove();
    document.getElementById('pears-menu')?.remove();

    // Build module links
    const links = MODULES.map(m => {
      const isActive = m.id === _module;
      const cls = isActive ? 'pm-link pm-active' : 'pm-link';
      return `<a class="${cls}" href="${m.url}">${m.label}</a>`;
    });

    // Insert separator before Configuración
    const configIdx = MODULES.findIndex(m => m.id === 'configuracion');
    links.splice(configIdx, 0, '<div class="pm-sep"></div>');

    const overlay = document.createElement('div');
    overlay.id = 'pears-overlay';
    overlay.onclick = () => close();

    const menu = document.createElement('div');
    menu.id = 'pears-menu';
    menu.innerHTML = `
      <div class="pm-profile">
        <div class="pm-av" id="pm-av"><span id="pm-initial"></span></div>
        <div>
          <div class="pm-name"  id="pm-name">—</div>
          <div class="pm-email" id="pm-email">—</div>
        </div>
      </div>
      <div class="pm-links">${links.join('')}</div>
      <div class="pm-bottom">
        <button class="pm-logout" onclick="typeof Auth !== 'undefined' ? Auth.logout() : (window.location.href='/')">
          Cerrar sesión
        </button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(menu);
  }

  function _populateUser(user) {
    const firstName = (user.nombre || '').split(' ')[0] || user.nombre;
    const initial   = firstName.charAt(0).toUpperCase();

    // Header avatar
    _setAvatar('pears-avatar', 'pears-avatar-initial', user.avatar, initial);

    // Menu avatar
    _setAvatar('pm-av', 'pm-initial', user.avatar, initial);

    // Menu name/email
    const nameEl  = document.getElementById('pm-name');
    const emailEl = document.getElementById('pm-email');
    if (nameEl)  nameEl.textContent  = firstName;
    if (emailEl) emailEl.textContent = user.email || '';
  }

  function _setAvatar(containerId, initialId, avatarUrl, initial) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (avatarUrl) {
      container.innerHTML = `<img src="${avatarUrl}" alt="${initial}">`;
    } else {
      _setAvatarInitial(initial, initialId);
    }
  }

  function _setAvatarInitial(initial, id) {
    const el = document.getElementById(id || 'pears-avatar-initial');
    if (el) el.textContent = initial;
  }

  return { init, toggle, open: open_, close };

})();

// Global aliases so onclick handlers in modules keep working
window.menuOpen    = () => PearsHeader.open();
window.menuClose   = () => PearsHeader.close();
window.toggleMenu  = () => PearsHeader.toggle();
window.closeMenu   = () => PearsHeader.close();
