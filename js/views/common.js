// Pieces shared by several screens: the product/brand/quality picker, paper documents for printing, and small helpers.
import { esc, money, qty, dateLong, productLook, icon, pill } from '../ui.js';
import { itemId, itemName, invoiceLabel, purchaseLabel, documentStatus, ledger } from '../domain.js';

const unique = (list) => [...new Set(list)];

// Product → brand → quality picker rendered into `host`. onChange(item | null) fires after every selection.
// Returns { get(), set(itemId), reset() }.
export function mountItemPicker(host, state, onChange) {
  let product = '';
  let brand = '';
  let quality = '';
  const brandsOf = (p) => unique(state.items.filter((i) => i.product === p).map((i) => i.brand).filter(Boolean));
  const qualitiesOf = (p, b) => unique(state.items.filter((i) => i.product === p && i.brand === b).map((i) => i.quality).filter(Boolean));
  const current = () => (product ? state.items.find((i) => i.id === itemId(product, brand, quality)) || null : null);

  const draw = () => {
    const brands = product ? brandsOf(product) : [];
    const qualities = product ? qualitiesOf(product, brand) : [];
    const it = current();
    host.innerHTML = `
      <div class="tiles" role="group" aria-label="Product">
        ${state.products.map((p) => {
          const look = productLook(p.name);
          return `<button type="button" class="tile ${p.name === product ? 'active' : ''}" data-p="${esc(p.name)}" style="--hue:${look.hue}">
            <span class="tile-icon">${icon(look.icon)}</span><span class="tile-name">${esc(p.name)}</span><span class="tile-unit">${esc(p.unit)}</span></button>`;
        }).join('')}
      </div>
      ${brands.length ? `<div class="chip-row"><span class="chip-label">Brand</span>${brands.map((b) => `<button type="button" class="chip ${b === brand ? 'active' : ''}" data-b="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}
      ${qualities.length ? `<div class="chip-row"><span class="chip-label">Quality</span>${qualities.map((q) => `<button type="button" class="chip ${q === quality ? 'active' : ''}" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
      <div class="picked ${it ? '' : 'picked-empty'}">${it
        ? `${icon('check2-circle')} <strong>${esc(itemName(it))}</strong> <span class="muted">· ${esc(it.unit || '')} · price index ${it.price === null ? 'not set' : money(it.price)}</span>`
        : product ? `${icon('hand-index')} Choose ${brands.length ? 'a brand' : ''}${brands.length && qualities.length ? ' and ' : ''}${qualities.length ? 'a quality' : ''}` : `${icon('hand-index')} Choose a product`}</div>`;
  };

  const select = (p, b, q) => {
    product = p; brand = b; quality = q;
    draw();
    onChange(current());
  };

  host.addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    const b = e.target.closest('[data-b]');
    const q = e.target.closest('[data-q]');
    if (p) {
      // A single brand (or quality) is chosen automatically; otherwise the user picks it.
      const brands = brandsOf(p.dataset.p);
      const nextBrand = brands.length === 1 ? brands[0] : '';
      const qualities = qualitiesOf(p.dataset.p, nextBrand);
      select(p.dataset.p, nextBrand, qualities.length === 1 ? qualities[0] : '');
    } else if (b) {
      const qualities = qualitiesOf(product, b.dataset.b);
      select(product, b.dataset.b, qualities.length === 1 ? qualities[0] : '');
    } else if (q) {
      select(product, brand, q.dataset.q);
    }
  });

  draw();
  return {
    get: current,
    set(id) {
      const it = state.items.find((i) => i.id === id);
      if (!it) return;
      product = it.product; brand = it.brand; quality = it.quality;
      draw();
      onChange(current());
    },
    reset() { product = ''; brand = ''; quality = ''; draw(); onChange(null); },
  };
}

// ---------- Paper documents (screen and print) ----------
export function invoiceDoc(state, inv) {
  const b = state.business;
  const rows = inv.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.product)}</td><td>${esc(l.brand || '—')}</td><td>${esc(l.quality || '—')}</td>
      <td class="num">${qty(l.qty)} ${esc(l.unit)}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.total)}</td></tr>`).join('');
  const status = documentStatus(state).get(inv.id);
  return `<article class="paper invoice">
    <header class="paper-head">
      <div>
        <div class="paper-brand">${esc(b.name)}</div>
        <div class="paper-sub">${esc(b.tagline || '')}</div>
        <div class="paper-addr">${esc(b.address)}<br>${esc(b.city)}<br>Phone ${esc(b.phone)}</div>
      </div>
      <div class="paper-title">
        <div class="paper-doc">Bill</div>
        <div class="paper-no">${esc(invoiceLabel(state, inv.no))}</div>
        <div class="paper-date">${esc(dateLong(inv.date))}</div>
      </div>
    </header>
    <section class="paper-party">
      <div><div class="label">Billed to</div><div class="party-name">${esc(inv.customerName)}</div>
        <div>${esc(inv.contact)}</div><div>${esc(inv.address)}</div><div>${esc(inv.city)}</div></div>
      <div class="paper-status"><div class="label">Status</div>${status ? `<strong>${esc(status.status)}</strong>` : ''}</div>
    </section>
    <table class="paper-table">
      <thead><tr><th>#</th><th>Product</th><th>Brand</th><th>Quality</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="paper-totals">
      <div><span>Amount</span><span class="num">${money(inv.amount)}</span></div>
      <div><span>Arrears brought forward</span><span class="num">${money(inv.arrears)}</span></div>
      <div><span>Deposit received</span><span class="num">− ${money(inv.deposit)}</span></div>
      <div class="grand"><span>Remainder</span><span class="num">${money(inv.remainder)}</span></div>
    </div>
    <footer class="paper-foot">
      <div class="sig">Seller signature</div><div class="sig">Customer signature</div>
      <p>All remaining arrears must be paid in full at your earliest convenience. Thank you for your business.</p>
    </footer>
  </article>`;
}

export function statementDoc(state, kind, party) {
  const b = state.business;
  const L = ledger(state, kind, party.id);
  const rows = L.rows.map((r) => `<tr><td>${esc(dateLong(r.date))}</td><td>${esc(r.ref)}</td><td>${esc(r.desc)}</td>
      <td class="num">${r.debit ? money(r.debit) : ''}</td><td class="num">${r.credit ? money(r.credit) : ''}</td><td class="num">${money(r.balance)}</td></tr>`).join('');
  const label = kind === 'customer' ? 'Customer statement' : 'Dealer statement';
  const balanceText = kind === 'customer' ? 'Balance receivable' : 'Balance payable';
  return `<article class="paper statement">
    <header class="paper-head">
      <div><div class="paper-brand">${esc(b.name)}</div><div class="paper-addr">${esc(b.address)}<br>${esc(b.city)}<br>Phone ${esc(b.phone)}</div></div>
      <div class="paper-title"><div class="paper-doc">${esc(label)}</div><div class="paper-date">Printed ${esc(dateLong(new Date().toISOString().slice(0, 10)))}</div></div>
    </header>
    <section class="paper-party"><div><div class="label">Account</div><div class="party-name">${esc(party.name)}</div>
      <div>${esc(party.contact)}</div><div>${esc(party.address)}</div><div>${esc(party.city)}</div></div>
      <div class="paper-status"><div class="label">${balanceText}</div><strong class="big">${money(Math.abs(L.balance))}</strong></div></section>
    <table class="paper-table">
      <thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No entries</td></tr>'}</tbody>
    </table>
    <footer class="paper-foot"><p>Debit increases the amount ${kind === 'customer' ? 'owed to us' : 'owed by us'}; credit reduces it.</p></footer>
  </article>`;
}

export function reportDoc(business, title, subtitle, body) {
  return `<article class="paper report">
    <header class="paper-head">
      <div><div class="paper-brand">${esc(business.name)}</div><div class="paper-addr">${esc(business.address)}, ${esc(business.city)}</div></div>
      <div class="paper-title"><div class="paper-doc">${esc(title)}</div><div class="paper-date">${esc(subtitle)}</div></div>
    </header>${body}</article>`;
}

// ---------- Small helpers ----------
export const dealersFor = (state, product) => {
  const list = state.dealers.filter((d) => (d.productNames || []).includes(product));
  return list.length ? list : state.dealers;
};

export const partyOptions = (list, selected = '') => list.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

export const balanceChip = (kind, amount) => {
  const v = Math.abs(amount);
  if (kind === 'customer') return amount > 0.004 ? `<span class="pill pill-bad">${money(v)} due</span>` : amount < -0.004 ? `<span class="pill pill-ok">${money(v)} advance</span>` : `<span class="pill pill-muted">Settled</span>`;
  return amount > 0.004 ? `<span class="pill pill-warn">${money(v)} to pay</span>` : amount < -0.004 ? `<span class="pill pill-ok">${money(v)} extra paid</span>` : `<span class="pill pill-muted">Settled</span>`;
};

export const purchaseNo = (p) => purchaseLabel(p.no);
export { pill };
