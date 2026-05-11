/* ============================================
   PEARS — menu.js v3.0
   Menú de usuario unificado.
   Llamar Menu.init('modulo') en el boot.
   ============================================ */

const Menu = {

  MODULES: [
    { id: 'compras',   label: 'Compras',   href: '../compras/'             },
    { id: 'hogar',     label: 'Hogar',     href: '../finanzas/'            },
    { id: 'viajes',    label: 'Viajes',    href: '../viajes/'              },
    { id: 'prestamos', label: 'Préstamos', href: '../prestamos/'           },
    { id: 'personal',  label: 'Personal',  href: '../finanzas-personales/' },
  ],

  init(currentModule) {
    this._injectStyles();
    this._injectPanel(currentModule);
    this._bindTriggers();
  },

  _injectStyles() {
    if (document.getElementById('pm-styles')) return;
    const s = document.createElement('style');
    s.id = 'pm-styles';
    s.textContent = `
.pm-overlay{display:none;position:fixed;inset:0;z-index:190;background:rgba(0,0,0,.55)}
.pm-overlay.open{display:block}
.pm-panel{
  position:fixed;top:0;right:0;bottom:0;
  width:min(260px,85vw);
  background:var(--panel,#111);
  border-left:1px solid var(--border2,rgba(255,255,255,.12));
  z-index:191;
  display:flex;flex-direction:column;
  transform:translateX(100%);
  transition:transform 240ms ease-out;
}
.pm-panel.open{transform:translateX(0)}
.pm-profile{
  display:flex;align-items:center;gap:12px;
  padding:20px 16px 16px;
  border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  flex-shrink:0;
}
.pm-avatar{
  width:38px;height:38px;border-radius:999px;
  overflow:hidden;flex-shrink:0;
  background:var(--raised,#1a1a1a);
  display:flex;align-items:center;justify-content:center;
  border:1px solid var(--border2,rgba(255,255,255,.12));
}
.pm-avatar img{width:100%;height:100%;object-fit:cover;display:block}
.pm-avatar-initial{font-size:15px;font-weight:500;color:var(--muted,rgba(255,255,255,.4));font-family:var(--font,'Inter',sans-serif)}
.pm-name{font-size:14px;font-weight:500;color:var(--text,#fff);font-family:var(--font,'Inter',sans-serif)}
.pm-email{font-size:11px;color:var(--muted,rgba(255,255,255,.4));margin-top:2px;font-family:var(--font,'Inter',sans-serif)}
.pm-links{flex:1;display:flex;flex-direction:column;overflow-y:auto}
.pm-item{
  display:block;padding:13px 16px;
  font-size:13px;color:var(--muted,rgba(255,255,255,.4));
  text-decoration:none;
  border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  transition:background 100ms,color 100ms;
  font-family:var(--font,'Inter',sans-serif);
  font-weight:400;
  cursor:pointer;background:none;border:none;
  border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  width:100%;text-align:left;
}
.pm-item:hover{background:var(--raised,#1a1a1a);color:var(--text,#fff)}
.pm-item--active{color:var(--accent,#00AAFF)!important;pointer-events:none}
.pm-logout{
  padding:14px 16px;font-size:13px;color:var(--err,#FF2D2D);
  background:none;border:none;border-top:1px solid var(--border,rgba(255,255,255,.07));
  cursor:pointer;text-align:left;flex-shrink:0;
  font-family:var(--font,'Inter',sans-serif);
  transition:opacity 100ms;
}
.pm-logout:hover{opacity:.75}
`;
    document.head.appendChild(s);
  },

  _injectPanel(current) {
    // Remove any existing panel
    document.getElementById('pm-overlay')?.remove();
    document.getElementById('pm-panel')?.remove();

    const user = Auth.getUser();
    const firstName = user?.nombre?.split(' ')[0] || user?.nombre || '';

    const avatarHtml = user?.avatar
      ? `<img src="${user.avatar}" alt="${firstName}">`
      : `<span class="pm-avatar-initial">${firstName.charAt(0).toUpperCase()}</span>`;

    const links = this.MODULES.map(m => {
      const isActive = m.id === current;
      if (isActive) {
        return `<span class="pm-item pm-item--active">${m.label}</span>`;
      }
      return `<a class="pm-item" href="${m.href}">${m.label}</a>`;
    }).join('');

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'pm-overlay';
    overlay.className = 'pm-overlay';
    overlay.onclick = () => Menu.close();

    // Panel
    const panel = document.createElement('div');
    panel.id = 'pm-panel';
    panel.className = 'pm-panel';
    panel.innerHTML = `
      <div class="pm-profile">
        <div class="pm-avatar">${avatarHtml}</div>
        <div>
          <div class="pm-name">${firstName}</div>
          <div class="pm-email">${user?.email || ''}</div>
        </div>
      </div>
      <div class="pm-links">${links}</div>
      <button class="pm-logout" onclick="Auth.logout()">Cerrar sesión</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
  },

  _bindTriggers() {
    // Capture all common avatar/trigger selectors across modules
    const selectors = [
      '#headerAvatar', '#userAvatar', '#avatar-btn',
      '.header-avatar', '#whoLabel', '[data-menu-trigger]'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        // Remove old onclick, add new
        el.onclick = null;
        el.setAttribute('onclick', '');
        el.addEventListener('click', (e) => { e.stopPropagation(); Menu.toggle(); });
      });
    });
  },

  toggle() {
    const open = document.getElementById('pm-panel')?.classList.contains('open');
    open ? this.close() : this.open();
  },

  open() {
    document.getElementById('pm-overlay')?.classList.add('open');
    document.getElementById('pm-panel')?.classList.add('open');
  },

  close() {
    document.getElementById('pm-overlay')?.classList.remove('open');
    document.getElementById('pm-panel')?.classList.remove('open');
  }
};

// Override any existing dropdown functions to use Menu
window.toggleDropdown = () => Menu.toggle();
window.closeDropdown  = () => Menu.close();
window.toggleMenu     = () => Menu.toggle();
window.closeMenu      = () => Menu.close();
