// Purchase entries (the Form sheet): what we bought from which dealer, at what price, with freight and what was paid now.
// Entries can be edited; each one has a printable purchase invoice.
import * as store from '../store.js';
import { esc, money, qty, dateLong, todayIso, icon, pill, confirmBox, toast, toastError, countUp, printHtml } from '../ui.js';
import { addPurchase, updatePurchase, deletePurchase, documentStatus, purchaseTotal, purchaseLabel, num, round2, itemName } from '../domain.js';
import { mountItemPicker, partyOptions, dealersFor, purchaseDoc } from './common.js';

// Credit: the amount stays on the dealer ledger and no payment entry is made.
const PAYMENT_METHODS = ['Cash', 'Cheque', 'Online', 'Cash+Cheque', 'Cash+Online', 'Online+Cheque', 'Credit'];

export default {
  async render(root, ctx) {
    const [sub, action] = ctx.params;
    if (sub === 'new') return entryForm(root, ctx, null);
    if (sub && action === 'edit') return entryForm(root, ctx, sub);
    if (sub) return purchaseView(root, sub);
    return purchaseLog(root, ctx);
  },
};

function entryForm(root, ctx, editId) {
  const s = store.get();
  const ex = editId ? s.purchases.find((p) => p.id === editId) : null;
  if (editId && !ex) {
    root.innerHTML = `<div class="empty"><div class="empty-icon">${icon('bag-check')}</div><p>This entry no longer exists.</p><a class="btn btn-ghost" href="#/purchases">Back to purchases</a></div>`;
    return;
  }
  let picked = null;
  let paidTouched = !!ex;
  let booting = !!ex;

  root.innerHTML = `
    <div class="builder">
      <div class="builder-main">
        <section class="card reveal">
          <div class="card-head"><h3><span class="step">1</span> What did we buy?</h3>${ex ? `<span class="muted small">Editing ${esc(purchaseLabel(ex.no))}</span>` : ''}</div>
          <div id="p-picker"></div>
        </section>
        <section class="card reveal">
          <div class="card-head"><h3><span class="step">2</span> From whom and how</h3></div>
          <div class="grid-form">
            <label class="field"><span>Dealer <em id="p-dealer-hint"></em></span><select class="select" id="p-dealer" disabled></select></label>
            <label class="field"><span>Date</span><input type="date" id="p-date" value="${esc(ex?.date || todayIso())}"></label>
            <label class="field"><span>Quantity <em id="p-unit"></em></span><input type="number" min="0" step="any" inputmode="decimal" id="p-qty" placeholder="0" value="${ex ? esc(ex.qty) : ''}"></label>
            <label class="field"><span>Price per unit (Rs)</span><input type="number" min="0" step="any" inputmode="decimal" id="p-price" placeholder="0" value="${ex ? esc(ex.price) : ''}"></label>
            <label class="field"><span>Freight (Rs)</span><input type="number" min="0" step="any" inputmode="decimal" id="p-freight" value="${ex ? esc(ex.freight) : 0}"></label>
            <label class="field"><span>Payment method</span><select class="select" id="p-method">
              ${PAYMENT_METHODS.map((m) => `<option ${m === (ex?.payment || 'Cash') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          </div>
          <div class="segmented" role="radiogroup" aria-label="Entry type">
            ${['Purchasing', 'Trading'].map((t) => `<label class="seg"><input type="radio" name="entry" value="${t}" ${(ex?.entryType || 'Purchasing') === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}
          </div>
          <p class="hint">Purchasing adds to stock. Trading is recorded on the ledger only. Selling is done from Bills, so it is not an entry type here.</p>
        </section>
      </div>
      <aside class="builder-side">
        <section class="card totals reveal">
          <div class="card-head"><h3>Entry total</h3></div>
          <div class="totals-row"><span>Qty × price</span><strong class="num" id="p-gross">${money(0)}</strong></div>
          <div class="totals-row"><span>Plus freight</span><strong class="num" id="p-less">${money(0)}</strong></div>
          <div class="totals-row big"><span>Total payable</span><strong class="num" id="p-total">${money(0)}</strong></div>
          <label class="totals-row totals-input"><span>Paid now</span><input type="number" min="0" step="any" inputmode="decimal" id="p-paid" value="${ex ? esc(ex.paidNow) : 0}"></label>
          <div class="totals-row"><span>Owed to dealer after this</span><strong class="num" id="p-owed">${money(0)}</strong></div>
          <div class="totals-note" id="p-note">Choose an item to continue.</div>
          <div class="totals-actions">
            ${ex ? `<a class="btn btn-ghost" href="#/purchases/${esc(ex.id)}">Cancel</a>` : ''}
            <button class="btn btn-primary btn-block" id="p-save" type="button"><i class="bi bi-check2"></i> ${ex ? 'Save changes' : 'Save purchase'}</button>
          </div>
        </section>
      </aside>
    </div>`;

  const $ = (sel) => root.querySelector(sel);

  // Dealers are listed only when they supply the chosen product (set in the dealer profile).
  function dealerSelect() {
    const sel = $('#p-dealer');
    const prev = sel.value || ex?.dealerId || '';
    if (!picked) {
      sel.innerHTML = '<option value="">Choose a product first</option>';
      sel.disabled = true;
      $('#p-dealer-hint').textContent = '';
      return;
    }
    const list = dealersFor(store.get(), picked.product);
    sel.disabled = false;
    sel.innerHTML = list.length
      ? `<option value="">Choose dealer…</option>${partyOptions(list, prev)}`
      : `<option value="">No dealer supplies ${esc(picked.product)}</option>`;
    $('#p-dealer-hint').textContent = list.length ? `${list.length} for ${picked.product}` : 'add in dealer profile';
  }

  const picker = mountItemPicker($('#p-picker'), s, (it) => {
    picked = it;
    if (!booting) {
      $('#p-price').value = it && it.price !== null ? it.price : '';
      paidTouched = false;
    }
    dealerSelect();
    if (!booting && it) {
      const list = dealersFor(store.get(), it.product);
      if (list.length === 1) $('#p-dealer').value = list[0].id;
    }
    recalc();
  });
  if (ex) {
    picker.set(ex.itemId);
    booting = false;
  }
  dealerSelect();
  recalc();

  function recalc() {
    const q = num($('#p-qty').value);
    const p = num($('#p-price').value);
    const f = num($('#p-freight').value);
    const gross = round2(q * p);
    const total = purchaseTotal({ qty: q, price: p, freight: f });
    const credit = $('#p-method').value === 'Credit';
    $('#p-paid').disabled = credit;
    if (credit) $('#p-paid').value = 0;
    else if (!paidTouched) $('#p-paid').value = total > 0 ? total : 0;
    const paid = num($('#p-paid').value);
    const dealerChosen = !!$('#p-dealer').value;
    const owed = dealerChosen ? round2(total - paid) : 0;
    countUp($('#p-gross'), gross, money);
    $('#p-less').textContent = `+ ${money(f)}`;
    countUp($('#p-total'), total, money);
    $('#p-owed').textContent = money(owed);
    $('#p-unit').textContent = picked ? `(${picked.unit})` : '';
    const note = $('#p-note');
    note.className = 'totals-note';
    if (!picked) note.textContent = 'Choose an item to continue.';
    else if (!dealerChosen) note.textContent = 'Choose the dealer who supplies this item.';
    else if (credit) note.textContent = `On credit: ${money(total)} stays on the dealer ledger.`;
    else if (paid > total + 0.004) { note.textContent = 'Paid now is more than the total.'; note.className = 'totals-note bad'; }
    else note.textContent = paid >= total ? 'Fully paid now.' : `${money(total - paid)} stays on the dealer ledger.`;
  }

  ['#p-qty', '#p-price', '#p-freight'].forEach((sel) => $(sel).addEventListener('input', recalc));
  $('#p-dealer').addEventListener('change', recalc);
  $('#p-method').addEventListener('change', recalc);
  $('#p-paid').addEventListener('input', () => { paidTouched = true; recalc(); });

  $('#p-save').addEventListener('click', async () => {
    try {
      if (!picked) throw new Error('Choose the item.');
      const data = {
        date: $('#p-date').value || todayIso(),
        dealerId: $('#p-dealer').value,
        itemId: picked.id,
        qty: $('#p-qty').value,
        price: $('#p-price').value,
        freight: $('#p-freight').value || 0,
        entryType: root.querySelector('input[name=entry]:checked')?.value || 'Purchasing',
        paidNow: $('#p-paid').value || 0,
        payment: $('#p-method').value,
      };
      const row = ex
        ? await store.mutate((d) => updatePurchase(d, ex.id, data))
        : await store.mutate((d) => addPurchase(d, data));
      if (ex) {
        toast(`${purchaseLabel(row.no)} updated · ${money(row.total)}`);
        location.hash = `#/purchases/${row.id}`;
        return;
      }
      toast(`${purchaseLabel(row.no)} saved · ${itemName(row)} ${qty(row.qty)} ${row.unit} · ${money(row.total)}`);
      $('#p-qty').value = '';
      $('#p-freight').value = '0';
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
        <thead><tr><th>Entry</th><th>Date</th><th>Dealer</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Freight</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody data-body>${rows.map((p) => `<tr data-dealer="${esc(p.dealerId)}" data-product="${esc(p.product)}">
          <td class="strong"><a href="#/purchases/${esc(p.id)}">${purchaseLabel(p.no)}</a></td>
          <td>${esc(dateLong(p.date))}</td>
          <td><a href="#/dealers/${esc(p.dealerId)}">${esc(p.dealerName)}</a></td>
          <td>${esc(itemName(p))}<div class="muted small">${esc(p.entryType)} · ${esc(p.payment)}</div></td>
          <td class="num">${qty(p.qty)} ${esc(p.unit)}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num">${money(p.freight || 0)}</td>
          <td class="num">${money(p.total)}</td>
          <td>${pill(status.get(p.id)?.status || 'Unpaid')}</td>
          <td class="actions">
            <a class="icon-btn" href="#/purchases/${esc(p.id)}" aria-label="Open entry" title="Open">${icon('eye')}</a>
            <a class="icon-btn" href="#/purchases/${esc(p.id)}/edit" aria-label="Edit entry" title="Edit">${icon('pencil')}</a>
            <button class="icon-btn danger" data-del="${esc(p.id)}" aria-label="Delete entry" type="button">${icon('trash3')}</button>
          </td></tr>`).join('')}</tbody>
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

// One purchase: the purchase invoice on paper, with edit, print and delete.
function purchaseView(root, id) {
  const s = store.get();
  const p = s.purchases.find((x) => x.id === id);
  if (!p) {
    root.innerHTML = `<div class="empty"><div class="empty-icon">${icon('bag-check')}</div><p>This entry no longer exists.</p><a class="btn btn-ghost" href="#/purchases">Back to purchases</a></div>`;
    return;
  }
  const st = documentStatus(s).get(p.id);
  root.innerHTML = `
    <div class="page-head">
      <div class="page-actions">
        <a class="btn btn-ghost" href="#/purchases"><i class="bi bi-arrow-left"></i> Purchases</a>
        <a class="btn btn-ghost" href="#/dealers/${esc(p.dealerId)}"><i class="bi bi-journal-text"></i> Dealer ledger</a>
      </div>
      <div class="page-actions">
        <button class="btn btn-danger-ghost" id="pur-del" type="button"><i class="bi bi-trash3"></i> Delete</button>
        <a class="btn btn-ghost" href="#/purchases/${esc(p.id)}/edit"><i class="bi bi-pencil"></i> Edit</a>
        <button class="btn btn-accent" id="pur-print" type="button"><i class="bi bi-printer"></i> Print</button>
      </div>
    </div>
    <div class="invoice-stage reveal">
      <div class="invoice-status">${pill(st?.status || 'Unpaid')} <span class="muted small">Paid ${money(st?.paid || 0)} of ${money(p.total)}</span></div>
      ${purchaseDoc(s, p)}
    </div>`;
  root.querySelector('#pur-print').addEventListener('click', () => printHtml(purchaseDoc(store.get(), store.get().purchases.find((x) => x.id === id))));
  root.querySelector('#pur-del').addEventListener('click', async () => {
    const ok = await confirmBox(`Delete ${purchaseLabel(p.no)} (${itemName(p)}, ${money(p.total)})? Its stock and any paid-now amount are removed.`, { okLabel: 'Delete entry', danger: true });
    if (!ok) return;
    try {
      await store.mutate((d) => deletePurchase(d, id));
      toast('Entry deleted');
      location.hash = '#/purchases';
    } catch (err) { toastError(err); }
  });
}
