// Sales bills (the Bill sheet): the bill register, the bill builder and the printable invoice.
import * as store from '../store.js';
import { esc, money, qty, dateLong, todayIso, icon, pill, confirmBox, toast, toastError, countUp, printHtml } from '../ui.js';
import { addInvoice, deleteInvoice, documentStatus, customerBalance, invoiceLabel, stockByItem, stockShortages, lineTotal, round2, num, itemName } from '../domain.js';
import { mountItemPicker, invoiceDoc, partyOptions } from './common.js';
import { customerForm } from './parties.js';

export default {
  async render(root, ctx) {
    const [sub] = ctx.params;
    if (sub === 'new') return newBill(root, ctx);
    if (sub) return invoiceView(root, sub, ctx);
    return register(root, ctx);
  },
};

// ---------- Register ----------
function register(root, ctx) {
  const s = store.get();
  const status = documentStatus(s);
  const rows = s.invoices.slice().sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const total = rows.reduce((a, i) => a + i.amount, 0);
  const due = rows.reduce((a, i) => a + (status.get(i.id)?.due || 0), 0);
  root.innerHTML = `
    <div class="page-head">
      <div><p class="muted">${rows.length} bills · billed ${esc(money(total))} · still due ${esc(money(due))}</p></div>
      <div class="page-actions"><input class="search" type="search" placeholder="Search bill no., customer…" data-search aria-label="Search bills"><a class="btn btn-accent" href="#/bills/new"><i class="bi bi-plus-lg"></i> New bill</a></div>
    </div>
    <div class="card table-card reveal">
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Bill</th><th>Date</th><th>Customer</th><th class="num">Items</th><th class="num">Amount</th><th class="num">Remainder</th><th>Status</th><th></th></tr></thead>
        <tbody data-body>${rows.map((i) => `<tr data-text="${esc(`${invoiceLabel(s, i.no)} ${i.customerName}`.toLowerCase())}">
          <td><a href="#/bills/${esc(i.id)}" class="strong">${esc(invoiceLabel(s, i.no))}</a></td>
          <td>${esc(dateLong(i.date))}</td>
          <td><a href="#/customers/${esc(i.customerId)}">${esc(i.customerName)}</a></td>
          <td class="num">${i.lines.length}</td>
          <td class="num">${money(i.amount)}</td>
          <td class="num">${money(i.remainder)}</td>
          <td>${pill(status.get(i.id)?.status || 'Unpaid')}</td>
          <td class="actions"><a class="icon-btn" href="#/bills/${esc(i.id)}" title="Open" aria-label="Open bill">${icon('eye')}</a></td></tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty"><div class="empty-icon">${icon('receipt')}</div><p>No bills yet.</p><a class="btn btn-accent" href="#/bills/new">Create the first bill</a></div>`}
    </div>`;
  root.querySelector('[data-search]')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('[data-body] tr').forEach((tr) => { tr.hidden = q && !tr.dataset.text.includes(q); });
  });
}

// ---------- Bill builder ----------
function newBill(root, ctx) {
  const s = store.get();
  const lines = [];
  let customerId = '';
  let picker = null;
  const state = { deposit: 0 };

  root.innerHTML = `
    <div class="builder">
      <div class="builder-main">
        <section class="card reveal">
          <div class="card-head"><h3><span class="step">1</span> Customer</h3></div>
          <div class="row-gap">
            <select class="select" id="bill-customer" aria-label="Customer">
              <option value="">Choose customer…</option>${partyOptions(s.customers)}
            </select>
            <button class="btn btn-ghost" id="bill-new-customer" type="button"><i class="bi bi-person-plus"></i> New</button>
          </div>
          <div class="customer-card" id="bill-customer-card"><span class="muted">Pick a customer to see their ledger balance.</span></div>
        </section>

        <section class="card reveal">
          <div class="card-head"><h3><span class="step">2</span> Items</h3><span class="muted small">Price index fills the rate</span></div>
          <div id="bill-picker"></div>
          <div class="add-line">
            <label class="field"><span>Quantity</span><input type="number" min="0" step="any" inputmode="decimal" id="bill-qty" placeholder="0"></label>
            <label class="field"><span>Rate (Rs)</span><input type="number" min="0" step="any" inputmode="decimal" id="bill-price" placeholder="0"></label>
            <div class="field"><span>Line total</span><div class="readout" id="bill-line-total">${money(0)}</div></div>
            <button class="btn btn-primary" id="bill-add" type="button"><i class="bi bi-plus-lg"></i> Add item</button>
          </div>
          <div class="hint" id="bill-stock-hint"></div>
        </section>
      </div>

      <aside class="builder-side">
        <section class="card reveal">
          <div class="card-head"><h3>Bill lines</h3><span class="muted small" id="bill-count">0 items</span></div>
          <div class="lines" id="bill-lines"></div>
        </section>
        <section class="card totals reveal">
          <div class="totals-row"><span>Amount</span><strong class="num" id="t-amount">${money(0)}</strong></div>
          <div class="totals-row"><span>Arrears (ledger balance)</span><strong class="num" id="t-arrears">${money(0)}</strong></div>
          <label class="totals-row totals-input"><span>Deposit received</span><input type="number" min="0" step="any" inputmode="decimal" id="bill-deposit" value="0" aria-label="Deposit"></label>
          <div class="totals-row big"><span>Remainder</span><strong class="num" id="t-remainder">${money(0)}</strong></div>
          <div class="totals-note" id="t-note"></div>
          <div class="totals-actions">
            <button class="btn btn-ghost" id="bill-save" type="button">Save bill</button>
            <button class="btn btn-accent" id="bill-save-print" type="button"><i class="bi bi-printer"></i> Save &amp; print</button>
          </div>
        </section>
      </aside>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const selectedItem = () => picker?.get() || null;

  picker = mountItemPicker($('#bill-picker'), s, (it) => {
    $('#bill-price').value = it && it.price !== null ? it.price : '';
    updateLineTotal();
    stockHint(it);
  });

  function stockHint(it) {
    const hint = $('#bill-stock-hint');
    if (!it) { hint.textContent = ''; return; }
    const have = stockByItem(store.get()).get(it.id) || 0;
    hint.innerHTML = `${icon('box-seam')} On hand: <strong>${qty(have)} ${esc(it.unit || '')}</strong>`;
    hint.classList.toggle('bad', have <= 0);
  }

  function updateLineTotal() {
    $('#bill-line-total').textContent = money(lineTotal($('#bill-qty').value, $('#bill-price').value));
  }
  $('#bill-qty').addEventListener('input', updateLineTotal);
  $('#bill-price').addEventListener('input', updateLineTotal);

  const amountOf = () => round2(lines.reduce((a, l) => a + l.total, 0));
  function drawLines() {
    const box = $('#bill-lines');
    box.innerHTML = lines.length
      ? lines.map((l, i) => `<div class="line" style="--hue:${l.hue}">
          <div class="line-main"><div class="strong">${esc(itemName(l))}</div><div class="muted small">${qty(l.qty)} ${esc(l.unit)} × ${money(l.price)}</div></div>
          <div class="line-total num">${money(l.total)}</div>
          <button class="icon-btn" data-rm="${i}" aria-label="Remove line" type="button">${icon('x-lg')}</button></div>`).join('')
      : `<div class="empty-mini">No items yet. Pick a product on the left, then add it.</div>`;
    $('#bill-count').textContent = `${lines.length} item${lines.length === 1 ? '' : 's'}`;
    drawTotals();
  }

  function drawTotals() {
    const cust = customerId ? store.get().customers.find((c) => c.id === customerId) : null;
    const arrears = cust ? customerBalance(store.get(), cust.id) : 0;
    const amount = amountOf();
    const dep = round2(num($('#bill-deposit').value));
    const remainder = round2(amount + arrears - dep);
    countUp($('#t-amount'), amount, money);
    $('#t-arrears').textContent = money(arrears);
    countUp($('#t-remainder'), remainder, money);
    const note = $('#t-note');
    if (dep > amount + arrears + 0.004) note.textContent = 'Deposit is more than the bill. The extra is kept as advance on the ledger.';
    else if (!cust) note.textContent = 'Choose a customer to save this bill.';
    else note.textContent = remainder > 0 ? 'Remaining balance stays on the customer ledger.' : 'Fully settled with this bill.';
    note.classList.toggle('bad', dep > amount + arrears + 0.004);
  }

  $('#bill-deposit').addEventListener('input', drawTotals);

  $('#bill-customer').addEventListener('change', (e) => {
    customerId = e.target.value;
    const c = store.get().customers.find((x) => x.id === customerId);
    $('#bill-customer-card').innerHTML = c
      ? `<div class="strong">${esc(c.name)}</div><div class="muted small">${esc([c.contact, c.address, c.city].filter(Boolean).join(' · '))}</div>`
      : `<span class="muted">Pick a customer to see their ledger balance.</span>`;
    drawTotals();
  });

  $('#bill-new-customer').addEventListener('click', async () => {
    const saved = await customerForm();
    if (!saved) return;
    const sel = $('#bill-customer');
    sel.insertAdjacentHTML('beforeend', `<option value="${esc(saved.id)}">${esc(saved.name)}</option>`);
    sel.value = saved.id;
    sel.dispatchEvent(new Event('change'));
    toast(`${saved.name} added`);
  });

  $('#bill-add').addEventListener('click', () => {
    const it = selectedItem();
    const q = num($('#bill-qty').value);
    const p = $('#bill-price').value;
    if (!it) return toast('Pick a product first.', 'warn');
    if (!(q > 0)) return toast('Enter the quantity.', 'warn');
    if (p === '' || num(p) < 0) return toast('Enter the rate.', 'warn');
    lines.push({ itemId: it.id, product: it.product, brand: it.brand, quality: it.quality, unit: it.unit, qty: q, price: num(p), total: lineTotal(q, p), hue: '#ffb703' });
    $('#bill-qty').value = '';
    picker.reset();
    $('#bill-price').value = '';
    $('#bill-stock-hint').textContent = '';
    updateLineTotal();
    drawLines();
    const row = $('#bill-lines').lastElementChild;
    if (globalThis.gsap && row) globalThis.gsap.from(row, { x: 24, opacity: 0, duration: 0.35, ease: 'power3.out' });
  });

  $('#bill-lines').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    lines.splice(Number(b.dataset.rm), 1);
    drawLines();
  });

  async function save(print) {
    try {
      if (!customerId) throw new Error('Choose the customer first.');
      if (!lines.length) throw new Error('Add at least one item.');
      const short = stockShortages(store.get(), lines);
      if (short.length) {
        const list = short.map((x) => {
          const it = store.get().items.find((i) => i.id === x.itemId);
          return `${itemName(it)} (have ${qty(x.have)}, need ${qty(x.need)})`;
        }).join('; ');
        const ok = await confirmBox(`Not enough stock: ${list}. Save the bill anyway? Stock will go negative until purchases are recorded.`, { okLabel: 'Save anyway', danger: true });
        if (!ok) return;
      }
      const dep = num($('#bill-deposit').value);
      const inv = await store.mutate((d) => addInvoice(d, { date: todayIso(), customerId, lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })), deposit: dep }));
      toast(`${invoiceLabel(store.get(), inv.no)} saved · ${money(inv.remainder)} remaining`);
      if (print) {
        sessionStorage.setItem('autoPrint', inv.id);
        location.hash = `#/bills/${inv.id}`;
      } else {
        ctx.refresh();
      }
    } catch (err) { toastError(err); }
  }
  $('#bill-save').addEventListener('click', () => save(false));
  $('#bill-save-print').addEventListener('click', () => save(true));

  drawLines();
}

// ---------- Invoice view ----------
function invoiceView(root, id, ctx) {
  const s = store.get();
  const inv = s.invoices.find((i) => i.id === id);
  if (!inv) { root.innerHTML = `<div class="empty"><div class="empty-icon">${icon('receipt')}</div><p>This bill no longer exists.</p><a class="btn btn-ghost" href="#/bills">Back to bills</a></div>`; return; }
  const st = documentStatus(s).get(inv.id);
  root.innerHTML = `
    <div class="page-head">
      <div class="page-actions">
        <a class="btn btn-ghost" href="#/bills"><i class="bi bi-arrow-left"></i> Bills</a>
        <a class="btn btn-ghost" href="#/customers/${esc(inv.customerId)}"><i class="bi bi-journal-text"></i> Customer ledger</a>
      </div>
      <div class="page-actions">
        <button class="btn btn-danger-ghost" id="inv-del" type="button"><i class="bi bi-trash3"></i> Delete</button>
        <button class="btn btn-accent" id="inv-print" type="button"><i class="bi bi-printer"></i> Print</button>
      </div>
    </div>
    <div class="invoice-stage reveal">
      <div class="invoice-status">${pill(st?.status || 'Unpaid')} <span class="muted small">Paid ${money(st?.paid || 0)} of ${money(inv.amount)}</span></div>
      ${invoiceDoc(s, inv)}
    </div>`;
  const print = () => printHtml(invoiceDoc(store.get(), store.get().invoices.find((i) => i.id === id)));
  root.querySelector('#inv-print').addEventListener('click', print);
  root.querySelector('#inv-del').addEventListener('click', async () => {
    const ok = await confirmBox(`Delete ${invoiceLabel(s, inv.no)}? Its deposit is removed from the ledger too. This cannot be undone.`, { okLabel: 'Delete bill', danger: true });
    if (!ok) return;
    try {
      await store.mutate((d) => deleteInvoice(d, id));
      toast('Bill deleted');
      location.hash = '#/bills';
    } catch (err) { toastError(err); }
  });
  if (sessionStorage.getItem('autoPrint') === id) {
    sessionStorage.removeItem('autoPrint');
    setTimeout(print, 450);
  }
}
