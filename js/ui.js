// Shared UI helpers: formatting, modals, toasts, confirmations, count-up numbers and print/CSV output.
// Motion uses GSAP when it is loaded and respects prefers-reduced-motion.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyShort = (n) => {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 10000000) return `Rs ${(v / 10000000).toFixed(2)} Cr`;
  if (a >= 100000) return `Rs ${(v / 100000).toFixed(2)} L`;
  return money(v);
};
export const qty = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
export const dateLong = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const icon = (name, cls = '') => `<i class="bi bi-${name} ${cls}" aria-hidden="true"></i>`;

export const STATUS_CLASS = { Paid: 'ok', 'Partly paid': 'warn', Unpaid: 'bad' };
export const pill = (status) => `<span class="pill pill-${STATUS_CLASS[status] || 'muted'}">${esc(status)}</span>`;

// Product look: icon and accent colour per product (matches the Excel product list).
export const PRODUCT_LOOK = {
  Cement: { icon: 'bucket', hue: '#94a3b8' },
  Steel: { icon: 'bar-chart-steps', hue: '#60a5fa' },
  Brick: { icon: 'bricks', hue: '#fb7185' },
  Sand: { icon: 'droplet-half', hue: '#fbbf24' },
  Aggregate: { icon: 'gem', hue: '#a3a3a3' },
  'Tile Bond': { icon: 'grid-3x3-gap', hue: '#34d399' },
  'Tile Filler': { icon: 'grid-fill', hue: '#2dd4bf' },
  Ring: { icon: 'record-circle', hue: '#c084fc' },
  'Steel Wire': { icon: 'bezier2', hue: '#818cf8' },
};
export const productLook = (name) => PRODUCT_LOOK[name] || { icon: 'box-seam', hue: '#fbbf24' };

const gsapOk = () => globalThis.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function modal({ title, body = '', footer = '', wide = false, onMount }) {
  const root = document.getElementById('modal-root');
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x-lg')}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div>`;
  root.appendChild(el);
  let closed = false;
  let resolveClose;
  const closedP = new Promise((r) => { resolveClose = r; });
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  const close = (value) => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    let finished = false;
    // Finish once: after the exit animation, or after a timeout if animation frames are not running.
    const done = () => { if (finished) return; finished = true; el.remove(); resolveClose(value); };
    if (gsapOk()) {
      globalThis.gsap.to(el.querySelector('.modal'), { y: 14, opacity: 0, scale: 0.98, duration: 0.18, ease: 'power2.in', onComplete: done });
      setTimeout(done, 320);
    } else done();
  };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(null); });
  document.addEventListener('keydown', onKey);
  if (gsapOk()) {
    globalThis.gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    globalThis.gsap.fromTo(el.querySelector('.modal'), { y: 22, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.4)' });
  }
  onMount?.(el, close);
  return { el, close, closed: closedP };
}

// Form in a modal. onSubmit(values, el) returns a result to close with (or throws to show the error).
export function formModal({ title, body, submitLabel = 'Save', wide = false, onSubmit, onMount }) {
  return new Promise((resolve) => {
    const m = modal({
      title, wide,
      body: `<form class="form" novalidate>${body}<div class="form-error" hidden></div></form>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" data-submit type="button">${esc(submitLabel)}</button>`,
      onMount: (el, close) => {
        const form = el.querySelector('form');
        const errBox = el.querySelector('.form-error');
        const submit = async () => {
          errBox.hidden = true;
          const btn = el.querySelector('[data-submit]');
          btn.disabled = true;
          try {
            const values = Object.fromEntries(new FormData(form).entries());
            const result = await onSubmit(values, el);
            if (result !== undefined && result !== false) close(result);
          } catch (err) {
            errBox.textContent = err.message || String(err);
            errBox.hidden = false;
            if (gsapOk()) globalThis.gsap.fromTo(errBox, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
          } finally { btn.disabled = false; }
        };
        el.querySelector('[data-submit]').addEventListener('click', submit);
        form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
        onMount?.(el, close);
      },
    });
    m.closed.then((v) => resolve(v));
  });
}

export function confirmBox(message, { okLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title: 'Please confirm',
      body: `<p class="confirm-text">${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok type="button">${esc(okLabel)}</button>`,
      onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => close(true)),
    });
    m.closed.then((v) => resolve(v === true));
  });
}

export function toast(message, kind = 'ok') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.innerHTML = `${icon(kind === 'bad' ? 'exclamation-octagon-fill' : kind === 'warn' ? 'exclamation-triangle-fill' : 'check-circle-fill')}<span>${esc(message)}</span>`;
  root.appendChild(t);
  if (gsapOk()) globalThis.gsap.fromTo(t, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
  // Removal is a plain timer, so toasts never pile up even when animation is unavailable.
  setTimeout(() => {
    if (gsapOk()) globalThis.gsap.to(t, { opacity: 0, x: 20, duration: 0.3, onComplete: () => t.remove() });
    setTimeout(() => t.remove(), 400);
  }, 3200);
}
export const toastError = (err) => toast(err?.message || String(err), 'bad');

// Animate a number from its current value to `to`. Formatting is done by fmt(n).
export function countUp(el, to, fmt = (n) => Math.round(n).toLocaleString('en-US')) {
  if (!el) return;
  if (!gsapOk()) { el.textContent = fmt(to); return; }
  const from = Number(el.dataset.value || 0);
  el.dataset.value = to;
  const obj = { v: from };
  globalThis.gsap.to(obj, { v: Number(to) || 0, duration: 1.1, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(obj.v); } });
}

// Smooth bar/meter fills after the element is in the DOM.
export function fillBars(root) {
  root.querySelectorAll('[data-fill]').forEach((b) => {
    const w = Math.max(0, Math.min(100, Number(b.dataset.fill) || 0));
    requestAnimationFrame(() => { b.style.width = `${w}%`; });
  });
}

// Staggered entrance for the main blocks of a page.
export function enter(root, selector = '.reveal') {
  if (!gsapOk()) return;
  globalThis.gsap.from(root.querySelectorAll(selector), { y: 18, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06, clearProps: 'transform,opacity' });
}

export function printHtml(html) {
  const area = document.getElementById('print-area');
  area.innerHTML = html;
  const cleanup = () => { area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 80);
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows) {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
