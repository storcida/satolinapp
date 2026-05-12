/* ============================================================
   PEARS — header.js  ·  v2  ·  LOCKED
   Solo maneja: toggle del menú + auth (foto/nombre).
   El HTML del H1 y menú van ESTÁTICOS en cada página.
   ============================================================ */

const PearsHeader = (() => {

  function init(moduleId) {
    // Mark active link in menu
    document.querySelectorAll('.pm-link[data-module]').forEach(a => {
      a.classList.toggle('pm-active', a.dataset.module === moduleId);
    });

    // Auth integration if available
    if (typeof Auth !== 'undefined') {
      Auth.onReady(user => {
        if (!user) { window.location.href = '/'; return; }
        _populate(user);
      });
    }
  }

  function _populate(user) {
    const first = (user.nombre || '').split(' ')[0] || user.nombre;

    // Header avatar
    const av = document.getElementById('pears-avatar');
    if (av) {
      if (user.avatar) {
        av.innerHTML = `<img src="${user.avatar}" alt="${first}">`;
      } else {
        const el = document.getElementById('pears-avatar-initial');
        if (el) el.textContent = first.charAt(0).toUpperCase();
      }
    }

    // Menu avatar + info
    const pmAv = document.getElementById('pm-av');
    if (pmAv) {
      if (user.avatar) {
        pmAv.innerHTML = `<img src="${user.avatar}" alt="${first}">`;
      } else {
        const el = document.getElementById('pm-initial');
        if (el) el.textContent = first.charAt(0).toUpperCase();
      }
    }
    const n = document.getElementById('pm-name');
    const e = document.getElementById('pm-email');
    if (n) n.textContent = first;
    if (e) e.textContent = user.email || '';
  }

  function toggle() {
    const open = document.getElementById('pears-menu')?.classList.contains('open');
    open ? close() : open_();
  }
  function open_() {
    document.getElementById('pears-menu')?.classList.add('open');
    document.getElementById('pears-overlay')?.classList.add('open');
  }
  function close() {
    document.getElementById('pears-menu')?.classList.remove('open');
    document.getElementById('pears-overlay')?.classList.remove('open');
  }

  return { init, toggle, open: open_, close };
})();

window.menuOpen   = () => PearsHeader.open();
window.menuClose  = () => PearsHeader.close();
window.toggleMenu = () => PearsHeader.toggle();
window.closeMenu  = () => PearsHeader.close();
