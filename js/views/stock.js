// Stock: what is on hand (by product, brand and quality), the movement log, and stock adjustments.
import * as store from '../store.js';
import { esc, money, qty, dateLong, icon, formModal, toast, countUp, fillBars, productLook, todayIso } from '../ui.js';
import { stockValuation, stockMovements, addAdjustment, itemName, num } from '../domain.js';

export default {
  async render(root, ctx) {
    const tab = ctx.params[0] === 'moves' ? 'moves' : 'onhand';
    const s = store.get();
    const val = stockValuation(s);
    const out = val.rows.filter((r) => r.qty <= 0).length;
    const low = val.rows.filter((r) => r.qty > 0 && r.qty < 20).length;

    root.innerHTML = `
      <section class="stats-row">
        <div class="stat reveal"><span>Stock value</span><strong class="num" data-val>${money(0)}</strong></div>
        <div class="stat reveal"><span>Items in price index</span><strong class="num">${val.rows.length}</strong></div>
        <div class="stat reveal warn"><span>Running low (under 20)</span><strong class="num">${low}</strong></div>
        <div class="stat reveal bad"><span>Out of stock</span><strong class="num">${out}</strong></div>
      </section>
      <div class="page-head">
        <nav class="tabs" role="tablist">
          <a class="tab ${tab === 'onhand' ? 'active' : ''}" href="#/stock" role="tab">On hand</a>
          <a class="tab ${tab === 'moves' ? 'active' : ''}" href="#/stock/moves" role="tab">Movements</a>
        </nav>
        <div class="page-actions"><button class="btn btn-accent" data-adjust type="button"><i class="bi bi-sliders"></i> Adjust stock</button></div>
      </div>
      <div data-body></div>`;
    countUp(root.querySelector('[data-val]'), val.total, money);

    const body = root.querySelector('[data-body]');
    if (tab === 'moves') renderMoves(body, s); else renderOnHand(body, s, val);

    root.querySelector('[data-adjust]').addEventListener('click', () => adjustDialog(null, ctx));
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-adj]');
      if (b) adjustDialog(b.dataset.adj, ctx);
    });
    fillBars(root);
  },
};

function renderOnHand(body, s, val) {
  const groups = s.products.map((p) => ({ p, rows: val.rows.filter((r) => r.product === p.name) })).filter((g) => g.rows.length);
  body.innerHTML = groups.map(({ p, rows }) => {
    const look = productLook(p.name);
    const max = Math.max(1, ...rows.map((r) => Math.max(0, r.qty)));
    const sub = rows.reduce((a, r) => a + r.value, 0);
    return `<section class="card stock-group reveal" style="--hue:${look.hue}">
      <header class="group-head"><span class="group-icon">${icon(look.icon)}</span><div><h3>${esc(p.name)}</h3><div class="muted small">per ${esc(p.unit)}</div></div>
        <div class="group-val"><span class="muted small">Value</span><strong class="num">${money(sub)}</strong></div></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Brand</th><th>Quality / size</th><th class="stock-bar-col">On hand</th><th class="num">Rate</th><th class="num">Value</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="${r.qty <= 0 ? 'row-bad' : ''}">
          <td class="strong">${esc(r.brand || '—')}</td>
          <td>${esc(r.quality || '—')}</td>
          <td class="stock-bar-col"><div class="qty-line"><span class="num">${qty(r.qty)} ${esc(r.unit)}</span>
            <div class="bar ${r.qty <= 0 ? 'bar-bad' : r.qty < 20 ? 'bar-warn' : ''}"><span data-fill="${Math.round((Math.max(0, r.qty) / max) * 100)}"></span></div></div></td>
          <td class="num">${r.price === null ? '—' : money(r.price)}</td>
          <td class="num">${money(r.value)}</td>
          <td class="actions"><button class="icon-btn" data-adj="${esc(r.id)}" aria-label="Adjust ${esc(itemName(r))}" type="button">${icon('sliders')}</button></td></tr>`).join('')}</tbody>
      </table></div></section>`;
  }).join('') || `<div class="empty"><div class="empty-icon">${icon('boxes')}</div><p>No items in the price index yet.</p></div>`;
}

function renderMoves(body, s) {
  const moves = stockMovements(s).slice(0, 400);
  body.innerHTML = `<div class="card table-card reveal">
    ${moves.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Item</th><th>Movement</th><th>Ref</th><th class="num">Quantity</th></tr></thead>
      <tbody>${moves.map((m) => `<tr>
        <td>${esc(dateLong(m.date))}</td>
        <td>${esc(itemName(m))}</td>
        <td><span class="pill ${m.qty < 0 ? 'pill-bad' : m.type === 'Adjustment' ? 'pill-muted' : 'pill-ok'}">${esc(m.type)}</span></td>
        <td class="muted">${esc(m.ref)}</td>
        <td class="num ${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${qty(m.qty)} ${esc(m.unit)}</td></tr>`).join('')}</tbody>
    </table></div>` : `<div class="empty"><p>No stock movements yet.</p></div>`}
  </div>`;
}

function adjustDialog(preselect, ctx) {
  const s = store.get();
  const options = s.items.map((i) => `<option value="${esc(i.id)}" ${i.id === preselect ? 'selected' : ''}>${esc(itemName(i))} (${esc(i.unit ? i.unit : '')})</option>`).join('');
  formModal({
    title: 'Adjust stock',
    submitLabel: 'Save adjustment',
    body: `<label class="field"><span>Item</span><select class="select" name="itemId" required>${options}</select></label>
      <div class="grid-form">
        <label class="field"><span>Quantity (use − to take out)</span><input name="qty" type="number" step="any" inputmode="decimal" required placeholder="e.g. 25 or -4"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${todayIso()}"></label>
      </div>
      <label class="field"><span>Reason</span><input name="note" placeholder="e.g. physical count, damaged bags"></label>`,
    onSubmit: async (v) => {
      if (!num(v.qty)) throw new Error('Enter a quantity other than zero.');
      await store.mutate((d) => addAdjustment(d, v));
      toast('Stock adjusted');
      ctx.refresh();
      return true;
    },
  });
}
