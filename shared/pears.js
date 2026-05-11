/* ============================================
   PEARS.js — Auth + Menu
   Una sola llamada por página: PEARS.init('modulo')
   ============================================ */

const PEARS = {

  MODULES: [
    { id: 'compras',   label: 'Compras',   url: '/compras/'             },
    { id: 'hogar',     label: 'Hogar',     url: '/finanzas/'            },
    { id: 'viajes',    label: 'Viajes',    url: '/viajes/'              },
    { id: 'prestamos', label: 'Préstamos', url: '/prestamos/'           },
    { id: 'personal',  label: 'Personal',  url: '/finanzas-personales/' },
  ],

  init(moduleId) {
    Auth.onReady(user => {
      if (!user) { window.location.href = '/'; return; }
      this._showApp();
      this._buildHeader(user, moduleId);
      this._buildMenu(user, moduleId);
      this._buildMenuToggle();
    });
  },

  // ── App shell ──────────────────────────────
  _showApp() {
    const app = document.getElementById('app');
    if (app) app.style.display = 'block';
  },

  // ── Header ─────────────────────────────────
  _buildHeader(user, moduleId) {
    // Avatar button in header
    const btn = document.getElementById('pears-avatar');
    if (!btn) return;
    const initial = (user.nombre || 'U').charAt(0).toUpperCase();
    if (user.avatar) {
      btn.innerHTML = `<img src="${user.avatar}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      btn.textContent = initial;
    }
    btn.onclick = () => this.menuToggle();
  },

  // ── Menu ───────────────────────────────────
  _buildMenu(user, moduleId) {
    // Remove existing
    document.getElementById('pears-menu-overlay')?.remove();
    document.getElementById('pears-menu')?.remove();

    const firstName = (user.nombre || '').split(' ')[0] || user.nombre;
    const avatarHtml = user.avatar
      ? `<img src="${user.avatar}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid #ddd">`
      : `<div style="width:40px;height:40px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:500">${firstName.charAt(0)}</div>`;

    const moduleLinks = this.MODULES.map(m => {
      const active = m.id === moduleId;
      return `<a href="${m.url}" style="display:block;padding:12px 20px;text-decoration:none;color:${active ? '#0070f3' : '#333'};font-weight:${active ? '600' : '400'};border-bottom:1px solid #f0f0f0;pointer-events:${active ? 'none' : 'auto'}">${m.label}</a>`;
    }).join('');

    const menuHTML = `
<div id="pears-menu-overlay" onclick="PEARS.menuClose()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:900"></div>
<div id="pears-menu" style="display:none;position:fixed;top:0;right:0;bottom:0;width:260px;background:#fff;border-left:1px solid #e5e5e5;z-index:901;flex-direction:column;overflow-y:auto">
  <div style="padding:20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">
    ${avatarHtml}
    <div>
      <div style="font-weight:600;font-size:14px">${firstName}</div>
      <div style="font-size:12px;color:#666;margin-top:2px">${user.email}</div>
    </div>
  </div>
  <div style="flex:1">
    ${moduleLinks}
  </div>
  <div style="border-top:1px solid #f0f0f0">
    <a href="/audit/" style="display:block;padding:12px 20px;text-decoration:none;color:#333;border-bottom:1px solid #f0f0f0">Audit Log</a>
    <button onclick="Auth.logout()" style="display:block;width:100%;padding:12px 20px;text-align:left;background:none;border:none;color:#e00;cursor:pointer;font-size:14px">Cerrar sesión</button>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', menuHTML);
  },

  _buildMenuToggle() {
    // Override any existing toggleMenu/toggleDropdown
    window.toggleMenu = window.toggleDropdown = () => this.menuToggle();
    window.closeMenu  = window.closeDropdown  = () => this.menuClose();
  },

  menuToggle() {
    const menu    = document.getElementById('pears-menu');
    const overlay = document.getElementById('pears-menu-overlay');
    if (!menu) return;
    const open = menu.style.display === 'flex';
    menu.style.display    = open ? 'none' : 'flex';
    overlay.style.display = open ? 'none' : 'block';
  },

  menuClose() {
    const menu    = document.getElementById('pears-menu');
    const overlay = document.getElementById('pears-menu-overlay');
    if (menu)    menu.style.display    = 'none';
    if (overlay) overlay.style.display = 'none';
  }
};
