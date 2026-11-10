// Purchase entries (the Form sheet): what we bought from which dealer, at what price, with rent and what was paid now.
import * as store from '../store.js';
import { esc, money, qty, dateLong, todayIso, icon, pill, confirmBox, toast, toastError, countUp } from '../ui.js';
import { addPurchase, deletePurchase, documentStatus, purchaseTotal, purchaseLabel, num, round2, itemName } from '../domain.js';
import { mountItemPicker, partyOptions, dealersFor } from './common.js';

export default {
  async render(root, ctx) {
    if (ctx.params[0] === 'new') return entryForm(root, ctx);
    return purchaseLog(root, ctx);
  },
};

function entryForm(root, ctx) {
  const s = store.get();
  let picked = null;
  let paidTouched = false;
  root.innerHTML = `
    <div class="builder">
      <div class="builder-main">
        <section class="card reveal">
          <div class="card-head"><h3><span class="step">1</span> What did we buy?</h3></div>
          <div id="p-picker"></div>
        </section>
        <section class="card reveal">
          <div class="card-head"><h3><span class="step">2</span> From whom and how</h3></div>
          <div class="grid-form">
            <label class="field"><span>Dealer</span><select class="select" id="p-dealer" required></select></label>
            <label class="field"><span>Date</span><input type="date" id="p-date" value="${todayIso()}"></label>
            <label class="field"><span>Quantity <em id="p-unit"></em></span><input type="number" min="0" step="any" inputmode="decimal" id="p-qty" placeholder="0"></label>
            <label class="field"><span>Price per unit (Rs)</span><input type="number" min="0" step="any" inputmode="decimal" id="p-price" placeholder="0"></label>
            <label class="field"><span>Rent (deducted, Rs)</span><input type="number" min="0" step="any" inputmode="decimal" id="p-rent" value="0"></label>
            <label class="field"><span>Payment method</span><select class="select" id="p-method">
              ${['Cash', 'Cheque', 'Online', 'Cash+Cheque', 'Cash+Online', 'Online+Cheque'].map((m) => `<option>${m}</option>`).join('')}</select></label>
          </div>
          <div class="segmented" role="radiogroup" aria-label="Entry type">
            ${['Purchasing', 'Trading', 'Selling'].map((t, i) => `<label class="seg"><input type="radio" name="entry" value="${t}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}
          </div>
          <p class="hint">Purchasing adds to stock. Trading is recorded on the ledger only. Selling takes stock out.</p>
        </section>
      </div>
      <aside class="builder-side">
        <section class="card totals reveal">
          <div class="card-head"><h3>Entry total</h3></div>
          <div class="totals-row"><span>Qty × price</span><strong class="num" id="p-gross">${money(0)}</strong></div>
          <div class="totals-row"><span>Less rent</span><strong class="num" id="p-less">${money(0)}</strong></div>
          <div class="totals-row big"><span>Total payable</span><strong class="num" id="p-total">${money(0)}</strong></div>
          <label class="totals-row totals-input"><span>Paid now</span><input type="number" min="0" step="any" inputmode="decimal" id="p-paid" value="0"></label>
          <div class="totals-row"><span>Owed to dealer after this</span><strong class="num" id="p-owed">${money(0)}</strong></div>
          <div class="totals-note" id="p-note">Choose an item and dealer to continue.</div>
          <div class="totals-actions"><button class="btn btn-primary btn-block" id="p-save" type="button"><i class="bi bi-check2"></i> Save purchase</button></div>
        </section>
      </aside>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const dealerSelect = () => {
    const list = picked ? dealersFor(store.get(), picked.product) : store.get().dealers;
    const prev = $('#p-dealer').value;
    $('#p-dealer').innerHTML = `<option value="">Choose dealer…</option>${partyOptions(list, prev)}`;
  };

  mountItemPicker($('#p-picker'), s, (it) => {
    picked = it;
    $('#p-unit').textContent = it ? `(${it.unit})` : '';
    $('#p-price').value = it && it.price !== null ? it.price : '';
    dealerSelect();
    if (it && it.product && store.get().dealers.filter((d) => (d.productNames || []).includes(it.product)).length === 1) {
      $('#p-dealer').value = store.get().dealers.find((d) => (d.productNames || []).includes(it.product)).id;
    }
    paidTouched = false;
    recalc();
  });
  dealerSelect();

  function recalc() {
    const q = num($('#p-qty').value);
    const p = num($('#p-price').value);
    const r = num($('#p-rent').value);
    const gross = round2(q * p);
    const total = purchaseTotal({ qty: q, price: p, rent: r });
    if (!paidTouched) $('#p-paid').value = total > 0 ? total : 0;
    const paid = num($('#p-paid').value);
    const dealer = store.get().dealers.find((d) => d.id === $('#p-dealer').value);
    const owed = dealer ? round2(total - paid) : 0;
    countUp($('#p-gross'), gross, money);
    $('#p-less').textContent = `− ${money(r)}`;
    countUp($('#p-total'), total, money);
    $('#p-owed').textContent = money(owed);
    $('#p-unit').textContent = picked ? `(${picked.unit})` : '';
    const note = $('#p-note');
    if (!picked) note.textContent = 'Choose an item to continue.';
    else if (!dealer) note.textContent = 'Choose the dealer.';
    else if (paid > total + 0.004) { note.textContent = 'Paid now is more than the total.'; note.className = 'totals-note bad'; return; }
    else note.textContent = paid >= total ? 'Fully paid now.' : `${money(total - paid)} stays on the dealer ledger.`;
    note.className = 'totals-note';
  }

  ['#p-qty', '#p-price', '#p-rent', '#p-dealer'].forEach((sel) => $(sel).addEventListener('input', recalc));
  $('#p-dealer').addEventListener('change', recalc);
  $('#p-paid').addEventListener('input', () => { paidTouched = true; recalc(); });

  $('#p-save').addEventListener('click', async () => {
    try {
      if (!picked) throw new Error('Choose the item.');
      const entryType = root.querySelector('input[name=entry]:checked')?.value || 'Purchasing';
      const row = await store.mutate((d) => addPurchase(d, {
        date: $('#p-date').value || todayIso(),
        dealerId: $('#p-dealer').value,
        itemId: picked.id,
        qty: $('#p-qty').value,
        price: $('#p-price').value,
        rent: $('#p-rent').value || 0,
        entryType,
        paidNow: $('#p-paid').value || 0,
        payment: $('#p-method').value,
      }));
      toast(`${purchaseLabel(row.no)} saved · ${itemName(row)} ${qty(row.qty)} ${row.unit} · ${money(row.total)}`);
      $('#p-qty').value = '';
      $('#p-rent').value = '0';
      paidTouched = false;
      picked = null;
      ctx.refresh();
    } catch (err) { toastError(err); }
  });
}

function purchaseLog(root, ctx) {
  const s = store.get();
  const status = documentStatus(s);
  const rows = s.purchases.slice().sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const total = rows.reduce((a, p) => a + p.total, 0);
  root.innerHTML = `
    <div class="page-head">
      <div><p class="muted">${rows.length} entries · total ${esc(money(total))}</p></div>
      <div class="page-actions">
        <select class="select compact" id="f-dealer" aria-label="Filter by dealer"><option value="">All dealers</option>${partyOptions(s.dealers)}</select>
        <select class="select compact" id="f-product" aria-label="Filter by product"><option value="">All products</option>${s.products.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select>
        <a class="btn btn-accent" href="#/purchases/new"><i class="bi bi-plus-lg"></i> New purchase</a>
      </div>
    </div>
    <div class="card table-card reveal">
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Entry</th><th>Date</th><th>Dealer</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Rent</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody data-body>${rows.map((p) => `<tr data-dealer="${esc(p.dealerId)}" data-product="${esc(p.product)}">
          <td class="strong">${purchaseLabel(p.no)}</td>
          <td>${esc(dateLong(p.date))}</td>
          <td><a href="#/dealers/${esc(p.dealerId)}">${esc(p.dealerName)}</a></td>
          <td>${esc(itemName(p))}<div class="muted small">${esc(p.entryType)} · ${esc(p.payment)}</div></td>
          <td class="num">${qty(p.qty)} ${esc(p.unit)}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num">${money(p.rent)}</td>
          <td class="num">${money(p.total)}</td>
          <td>${pill(status.get(p.id)?.status || 'Unpaid')}</td>
          <td class="actions"><button class="icon-btn danger" data-del="${esc(p.id)}" aria-label="Delete entry" type="button">${icon('trash3')}</button></td></tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty"><div class="empty-icon">${icon('bag-check')}</div><p>No purchases recorded yet.</p><a class="btn btn-accent" href="#/purchases/new">Record the first purchase</a></div>`}
    </div>`;

  const applyFilter = () => {
    const d = root.querySelector('#f-dealer').value;
    const p = root.querySelector('#f-product').value;
    root.querySelectorAll('[data-body] tr').forEach((tr) => {
      tr.hidden = (d && tr.dataset.dealer !== d) || (p && tr.dataset.product !== p);
    });
  };
  root.querySelector('#f-dealer')?.addEventListener('change', applyFilter);
  root.querySelector('#f-product')?.addEventListener('change', applyFilter);
  root.querySelector('[data-body]')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const p = s.purchases.find((x) => x.id === b.dataset.del);
    const ok = await confirmBox(`Delete ${purchaseLabel(p.no)} (${itemName(p)}, ${money(p.total)})? Its stock and any paid-now amount are removed.`, { okLabel: 'Delete entry', danger: true });
    if (!ok) return;
    try {
      await store.mutate((d) => deletePurchase(d, p.id));
      toast('Entry deleted');
      ctx.refresh();
    } catch (err) { toastError(err); }
  });
}
