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

/* ── Header info: fecha / hora / clima ── */
(function() {
  var DAYS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var MONTHS= ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  var WMO_ICON = {
    0:'☀', 1:'🌤', 2:'⛅', 3:'☁',
    45:'🌫', 48:'🌫',
    51:'🌦', 53:'🌦', 55:'🌧',
    61:'🌧', 63:'🌧', 65:'🌧',
    71:'🌨', 73:'🌨', 75:'🌨',
    80:'🌦', 81:'🌧', 82:'🌧',
    95:'⛈', 96:'⛈', 99:'⛈'
  };

  // SVG weather icons (no emoji)
  function weatherSVG(wmo) {
    var code = Math.floor((wmo||0)/10)*10;
    if (wmo === 0)                  return sunSVG();
    if (wmo <= 2)                   return sunCloudSVG();
    if (wmo <= 3)                   return cloudSVG();
    if (wmo >= 51 && wmo <= 67)     return rainSVG();
    if (wmo >= 71 && wmo <= 77)     return snowSVG();
    if (wmo >= 80 && wmo <= 82)     return rainSVG();
    if (wmo >= 95)                  return stormSVG();
    return cloudSVG();
  }
  function sunSVG()      { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'; }
  function cloudSVG()    { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>'; }
  function sunCloudSVG() { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v2M4.22 4.22l1.42 1.42M2 12h2M4.22 19.78l1.42-1.42M12 18a6 6 0 1 1 0-12"/><path d="M17 18h-8a4 4 0 0 1 0-8 4 4 0 0 1 7.74-1A4 4 0 0 1 17 18z"/></svg>'; }
  function rainSVG()     { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>'; }
  function snowSVG()     { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 7l-5 5-5-5M17 17l-5-5-5 5M2 12l5-2.5M2 12l5 2.5M22 12l-5-2.5M22 12l-5 2.5"/></svg>'; }
  function stormSVG()    { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'; }

  function pad(n){ return String(n).padStart(2,'0'); }

  function tick() {
    var el = document.getElementById('pears-h1-clock');
    if (!el) return;
    var now = new Date();
    var d = DAYS[now.getDay()];
    var dd = now.getDate();
    var mo = MONTHS[now.getMonth()];
    var hh = pad(now.getHours());
    var mm = pad(now.getMinutes());
    el.textContent = d+' '+dd+' '+mo+'  '+hh+':'+mm;
  }

  async function fetchWeather() {
    var el = document.getElementById('pears-h1-weather');
    if (!el) return;
    try {
      // Asunción coords
      var lat = -25.2867, lon = -57.647;
      var url = 'https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,weathercode&temperature_unit=celsius&timezone=America%2FAsuncion';
      var r = await fetch(url);
      var d = await r.json();
      var temp = Math.round(d.current.temperature_2m);
      var wmo  = d.current.weathercode;
      el.innerHTML = weatherSVG(wmo) + ' ' + temp + '°';
    } catch(e) {
      el.style.display = 'none';
    }
  }

  function initInfo() {
    var infoEl = document.getElementById('pears-h1-info');
    if (!infoEl) return;
    tick();
    setInterval(tick, 30000);
    fetchWeather();
    setInterval(fetchWeather, 10 * 60 * 1000); // refresh every 10 min
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInfo);
  } else {
    initInfo();
  }
})();
