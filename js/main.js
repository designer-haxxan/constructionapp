// Boot, sign-in gate, navigation and hash routing.
import * as store from './store.js';
import * as auth from './auth.js';
import { toastError, icon, esc, enter } from './ui.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', section: 'Overview', icon: 'speedometer2', load: () => import('./views/dashboard.js') },
  bills: { title: 'Sales bills', section: 'Trade', icon: 'receipt', load: () => import('./views/bills.js') },
  purchases: { title: 'Purchases', section: 'Trade', icon: 'bag-check', load: () => import('./views/purchases.js') },
  customers: { title: 'Customer ledgers', section: 'Ledgers', icon: 'people', load: () => import('./views/parties.js'), kind: 'customer' },
  dealers: { title: 'Dealer ledgers', section: 'Ledgers', icon: 'truck', load: () => import('./views/parties.js'), kind: 'dealer' },
  stock: { title: 'Stock', section: 'Stock', icon: 'boxes', load: () => import('./views/stock.js') },
  prices: { title: 'Price index', section: 'Stock', icon: 'tags', load: () => import('./views/prices.js') },
  reports: { title: 'Reports', section: 'Insight', icon: 'file-earmark-bar-graph', load: () => import('./views/reports.js') },
  settings: { title: 'Settings', section: 'Insight', icon: 'gear', load: () => import('./views/settings.js') },
};
const SECTIONS = ['Overview', 'Trade', 'Ledgers', 'Stock', 'Insight'];

const $ = (sel) => document.querySelector(sel);
let renderToken = 0;

// ---------- Sign-in ----------
function showLogin(note = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-note').textContent = note;
  introLogin();
  setTimeout(() => $('#login-user').focus(), 60);
}

function introLogin() {
  if (!globalThis.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = globalThis.gsap;
  g.timeline()
    .from('.login-art .b', { scaleY: 0, transformOrigin: 'bottom', duration: 0.9, ease: 'power3.out', stagger: 0.12 })
    .from('.login-art .win', { opacity: 0, duration: 0.3, stagger: { each: 0.03, from: 'random' } }, '-=0.3')
    .to('.login-art .win', { opacity: 0.25, duration: 1.2, repeat: -1, yoyo: true, stagger: { each: 0.25, from: 'random' }, ease: 'sine.inOut' }, '-=0.1')
    .from('.login-art .ground', { scaleX: 0, transformOrigin: 'left', duration: 0.8, ease: 'power2.out' }, 0)
    .from('.login-art .crane', { opacity: 0, duration: 0.5 }, 0.2)
    .fromTo('.login-art .hook', { y: -40 }, { y: 0, duration: 1.4, ease: 'power1.inOut', yoyo: true, repeat: -1 }, 0.8)
    .from('.login-brand .mark span', { y: -28, opacity: 0, rotation: -8, duration: 0.5, ease: 'back.out(2)', stagger: 0.1 }, 0.1)
    .from('.login-card', { y: 26, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.25)
    .from('.blueprint', { opacity: 0, duration: 1 }, 0);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.hidden = true;
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in…';
  try {
    const f = new FormData(e.target);
    await auth.signIn(f.get('username'), f.get('password'));
    e.target.reset();
    await enterApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    if (globalThis.gsap) globalThis.gsap.fromTo('.login-card', { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Sign in';
  }
});

$('#signout').addEventListener('click', () => {
  auth.signOut();
  showLogin('Signed out.');
});

// ---------- Shell ----------
function buildNav() {
  let html = '';
  for (const section of SECTIONS) {
    const items = Object.entries(ROUTES).filter(([, r]) => r.section === section);
    if (!items.length) continue;
    html += `<div class="nav-section">${section}</div>`;
    for (const [id, r] of items) {
      html += `<a class="nav-link" href="#/${id}" data-route="${id}"><i class="bi bi-${r.icon}"></i><span>${esc(r.title)}</span></a>`;
    }
  }
  $('#nav').innerHTML = html;
}

function setActive(routeId) {
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.route === routeId));
  const r = ROUTES[routeId];
  $('#page-title').textContent = r?.title || '';
  $('#crumb-section').textContent = r?.section || '';
  document.title = `${r?.title || 'Materials Ledger'} · ${store.get().business.name}`;
}

const ctx = {
  refresh: () => route(),
  go: (hash) => { location.hash = hash; },
};

async function route() {
  if (!auth.currentSession()) return showLogin('Your session has ended. Sign in again.');
  // A dialog left open from the previous screen is dismissed (its promise resolves as cancelled).
  document.querySelectorAll('#modal-root .modal-backdrop [data-close]').forEach((b) => b.click());
  const token = ++renderToken;
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(decodeURIComponent);
  const id = ROUTES[parts[0]] ? parts[0] : 'dashboard';
  const r = ROUTES[id];
  setActive(id);
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');
  const view = $('#view');
  view.innerHTML = '<div class="loading"><div class="loader"><span></span><span></span><span></span></div></div>';
  try {
    const mod = await r.load();
    if (token !== renderToken) return;
    const container = document.createElement('div');
    container.className = 'view';
    view.replaceChildren(container);
    await mod.default.render(container, { params: parts.slice(1), kind: r.kind, route: id, ...ctx });
    if (token !== renderToken) return;
    enter(container);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (token === renderToken) view.innerHTML = `<div class="empty"><div class="empty-icon">${icon('exclamation-octagon')}</div><p>${esc(e.message || String(e))}</p></div>`;
  }
}

async function enterApp() {
  const s = store.get();
  $('#brand-name').textContent = s.business.name;
  const session = auth.currentSession();
  $('#user-name').textContent = session?.username || '';
  $('#user-initial').textContent = (session?.username || 'S').charAt(0).toUpperCase();
  buildNav();
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (globalThis.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    globalThis.gsap.from('.sidebar', { x: -24, opacity: 0, duration: 0.5, ease: 'power3.out' });
    globalThis.gsap.from('.topbar', { y: -12, opacity: 0, duration: 0.45, ease: 'power2.out', delay: 0.05 });
  }
  await route();
}

// Top-bar shortcuts.
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) location.hash = go.dataset.go;
});
$('#menu-btn').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('scrim').classList.toggle('show');
});
$('#scrim').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('open');
  $('#scrim').classList.remove('show');
});
window.addEventListener('hashchange', () => route());
setInterval(() => { if (!$('#app').hidden && !auth.currentSession()) showLogin('Your session has ended. Sign in again.'); }, 60000);

// ---------- Boot ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('Offline cache unavailable:', e));
}

(async function boot() {
  try {
    await store.init();
    if (auth.currentSession()) await enterApp();
    else showLogin();
  } catch (e) {
    toastError(e);
    $('#login').hidden = false;
    $('#login-note').textContent = `Could not open local storage: ${e.message}`;
  }
})();
