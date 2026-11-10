// Customer and dealer ledgers. Same screens for both: a list of parties and one running ledger per party.
import * as store from '../store.js';
import { esc, money, dateLong, todayIso, icon, formModal, confirmBox, toast, toastError, countUp, printHtml, downloadFile, csv, debounce, productLook } from '../ui.js';
import { upsertParty, deleteParty, addPayment, deletePayment, ledger, customerBalance, dealerBalance } from '../domain.js';
import { statementDoc, balanceChip } from './common.js';

const LABEL = {
  customer: { one: 'customer', many: 'Customers', add: 'Add customer', pay: 'Receive payment', payVerb: 'Received', owed: 'They owe us', list: '#/customers', balance: customerBalance },
  dealer: { one: 'dealer', many: 'Dealers', add: 'Add dealer', pay: 'Pay dealer', payVerb: 'Paid out', owed: 'We owe them', list: '#/dealers', balance: dealerBalance },
};
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default {
  async render(root, ctx) {
    const kind = ctx.kind;
    const [id] = ctx.params;
    if (id) return detail(root, kind, id, ctx);
    return list(root, kind, ctx);
  },
};

// ---------- List ----------
function list(root, kind, ctx) {
  const s = store.get();
  const L = LABEL[kind];
  const parties = (kind === 'customer' ? s.customers : s.dealers)
    .map((p) => ({ p, bal: L.balance(s, p.id) }))
    .sort((a, b) => b.bal - a.bal || a.p.name.localeCompare(b.p.name));
  const total = parties.reduce((a, x) => a + Math.max(0, x.bal), 0);
  root.innerHTML = `
    <div class="page-head">
      <div><p class="muted">${parties.length} ${L.many.toLowerCase()} · ${kind === 'customer' ? 'owed to us' : 'we owe'} ${esc(money(total))}</p></div>
      <div class="page-actions">
        <input class="search" type="search" placeholder="Search by name, contact…" data-search aria-label="Search">
        <button class="btn btn-accent" data-add type="button"><i class="bi bi-person-plus"></i> ${L.add}</button>
      </div>
    </div>
    <div class="cards-grid" data-grid>
      ${parties.map(({ p, bal }) => `<a class="party-card reveal" href="${L.list}/${esc(p.id)}" data-text="${esc(`${p.name} ${p.contact} ${p.city}`.toLowerCase())}">
        <div class="party-top"><span class="party-avatar" style="--hue:${kind === 'dealer' ? '#fbbf24' : '#60a5fa'}">${esc(initials(p.name))}</span>
          <div><div class="strong">${esc(p.name)}</div><div class="muted small">${esc(p.contact || p.city || '—')}</div></div></div>
        ${kind === 'dealer' && p.productNames?.length ? `<div class="party-products">${p.productNames.map((n) => `<span class="mini-tag">${icon(productLook(n).icon)} ${esc(n)}</span>`).join('')}</div>` : ''}
        <div class="party-foot">${balanceChip(kind, bal)}<span class="link">Open ledger ${icon('arrow-right')}</span></div>
      </a>`).join('') || `<div class="empty"><div class="empty-icon">${icon(kind === 'customer' ? 'people' : 'truck')}</div><p>No ${L.many.toLowerCase()} yet.</p></div>`}
    </div>`;
  root.querySelector('[data-add]').addEventListener('click', async () => {
    const saved = await partyForm(kind);
    if (saved) { toast(`${saved.name} added`); ctx.refresh(); }
  });
  root.querySelector('[data-search]').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('[data-text]').forEach((el) => { el.hidden = q && !el.dataset.text.includes(q); });
  }, 120));
}

// ---------- Ledger ----------
function detail(root, kind, id, ctx) {
  const s = store.get();
  const L = LABEL[kind];
  const party = (kind === 'customer' ? s.customers : s.dealers).find((p) => p.id === id);
  if (!party) { root.innerHTML = `<div class="empty"><p>This ${L.one} no longer exists.</p><a class="btn btn-ghost" href="${L.list}">Back</a></div>`; return; }
  const led = ledger(s, kind, id);
  const bal = L.balance(s, id);
  const billed = led.totals.debit;
  const settled = led.totals.credit;
  root.innerHTML = `
    <div class="page-head">
      <div class="page-actions"><a class="btn btn-ghost" href="${L.list}"><i class="bi bi-arrow-left"></i> ${L.many}</a></div>
      <div class="page-actions">
        <button class="btn btn-ghost" data-edit type="button"><i class="bi bi-pencil-square"></i> Edit</button>
        <button class="btn btn-ghost" data-csv type="button"><i class="bi bi-filetype-csv"></i> CSV</button>
        <button class="btn btn-ghost" data-print type="button"><i class="bi bi-printer"></i> Statement</button>
        <button class="btn btn-accent" data-pay type="button"><i class="bi bi-cash-stack"></i> ${L.pay}</button>
      </div>
    </div>
    <section class="ledger-hero reveal">
      <div class="ledger-id">
        <span class="party-avatar big" style="--hue:${kind === 'dealer' ? '#fbbf24' : '#60a5fa'}">${esc(initials(party.name))}</span>
        <div>
          <div class="eyebrow">${kind === 'customer' ? 'Customer ledger' : 'Dealer ledger'}</div>
          <h2>${esc(party.name)}</h2>
          <div class="muted">${esc([party.contact, party.address, party.city].filter(Boolean).join(' · ') || 'No contact details')}</div>
          ${kind === 'dealer' && party.productNames?.length ? `<div class="party-products">${party.productNames.map((n) => `<span class="mini-tag">${icon(productLook(n).icon)} ${esc(n)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="ledger-balance">
        <div class="label">${L.owed}</div>
        <div class="balance-value ${bal > 0.004 ? 'bad' : bal < -0.004 ? 'ok' : ''}" data-balance>${money(0)}</div>
        <div>${balanceChip(kind, bal)}</div>
      </div>
    </section>
    <section class="stats-row">
      <div class="stat reveal"><span>${kind === 'customer' ? 'Billed' : 'Purchased'}</span><strong class="num">${money(billed)}</strong></div>
      <div class="stat reveal"><span>${kind === 'customer' ? 'Received' : 'Paid'}</span><strong class="num">${money(settled)}</strong></div>
      <div class="stat reveal"><span>Entries</span><strong class="num">${led.rows.length}</strong></div>
      <div class="stat reveal"><span>${kind === 'customer' ? 'Bills' : 'Purchase entries'}</span><strong class="num">${kind === 'customer' ? s.invoices.filter((i) => i.customerId === id).length : s.purchases.filter((p) => p.dealerId === id).length}</strong></div>
    </section>
    <div class="card table-card reveal">
      <div class="card-head"><h3>Statement</h3><span class="muted small">Running balance, oldest first</span></div>
      ${led.rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th><th></th></tr></thead>
        <tbody>${led.rows.map((r) => `<tr class="kind-${r.kind}">
          <td>${esc(dateLong(r.date))}</td>
          <td>${r.kind === 'invoice' ? `<a href="#/bills/${esc(r.id)}">${esc(r.ref)}</a>` : r.kind === 'purchase' ? esc(r.ref) : esc(r.ref)}</td>
          <td>${esc(r.desc)}</td>
          <td class="num">${r.debit ? money(r.debit) : ''}</td>
          <td class="num">${r.credit ? money(r.credit) : ''}</td>
          <td class="num strong">${money(r.balance)}</td>
          <td class="actions">${r.kind === 'payment' ? `<button class="icon-btn danger" data-del-pay="${esc(r.id)}" aria-label="Delete payment" type="button">${icon('trash3')}</button>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty"><p>No entries yet.</p></div>`}
    </div>`;

  countUp(root.querySelector('[data-balance]'), Math.abs(bal), money);

  root.querySelector('[data-edit]').addEventListener('click', async () => {
    const saved = await partyForm(kind, party);
    if (saved) { toast('Saved'); ctx.refresh(); }
  });
  const hasDocs = kind === 'customer' ? s.invoices.some((i) => i.customerId === id) : s.purchases.some((p) => p.dealerId === id);
  if (!hasDocs) {
    const del = document.createElement('button');
    del.className = 'btn btn-danger-ghost';
    del.type = 'button';
    del.innerHTML = `${icon('trash3')} Delete`;
    root.querySelector('.page-actions:last-child').prepend(del);
    del.addEventListener('click', async () => {
      if (!await confirmBox(`Delete ${party.name}? Their ledger is removed. This cannot be undone.`, { okLabel: 'Delete', danger: true })) return;
      try {
        await store.mutate((d) => deleteParty(d, kind, id));
        toast('Deleted');
        location.hash = L.list;
      } catch (err) { toastError(err); }
    });
  }
  root.querySelector('[data-pay]').addEventListener('click', () => recordPayment(kind, party, bal, ctx));
  root.querySelector('[data-print]').addEventListener('click', () => printHtml(statementDoc(store.get(), kind, party)));
  root.querySelector('[data-csv]').addEventListener('click', () => {
    const rows = [['Date', 'Ref', 'Details', 'Debit', 'Credit', 'Balance']];
    led.rows.forEach((r) => rows.push([r.date, r.ref, r.desc, r.debit || '', r.credit || '', r.balance]));
    downloadFile(`${party.name.replace(/\W+/g, '_')}-ledger-${todayIso()}.csv`, csv(rows), 'text/csv');
  });
  root.querySelectorAll('[data-del-pay]').forEach((b) => b.addEventListener('click', async () => {
    const p = s.payments.find((x) => x.id === b.dataset.delPay);
    const warn = p?.refType ? ' This payment came with a bill or purchase, so that document will show as unpaid again.' : '';
    if (!await confirmBox(`Delete this payment of ${money(p.amount)}?${warn}`, { okLabel: 'Delete', danger: true })) return;
    try {
      await store.mutate((d) => deletePayment(d, p.id));
      toast('Payment deleted');
      ctx.refresh();
    } catch (err) { toastError(err); }
  }));
}

function recordPayment(kind, party, bal, ctx) {
  const L = LABEL[kind];
  const suggested = Math.max(0, Math.abs(bal)).toFixed(2);
  formModal({
    title: `${L.pay} · ${party.name}`,
    submitLabel: L.pay,
    body: `<div class="grid-form">
        <label class="field"><span>Amount (Rs)</span><input name="amount" type="number" min="0" step="any" inputmode="decimal" required value="${suggested}"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${todayIso()}"></label>
        <label class="field"><span>Method</span><select name="method" class="select">${['Cash', 'Cheque', 'Online', 'Bank transfer'].map((m) => `<option>${m}</option>`).join('')}</select></label>
        <label class="field"><span>Note</span><input name="note" placeholder="${kind === 'customer' ? 'e.g. part payment for bills' : 'e.g. cheque no. 1234'}"></label>
      </div>
      <p class="hint">Payments settle the oldest bills first. Anything above the balance is kept as advance.</p>`,
    onSubmit: async (v) => {
      await store.mutate((d) => addPayment(d, {
        dir: kind === 'customer' ? 'in' : 'out', partyId: party.id, date: v.date || todayIso(), amount: v.amount, method: v.method, note: v.note,
      }));
      toast(`${L.payVerb} ${money(v.amount)}`);
      ctx.refresh();
      return true;
    },
  });
}

// ---------- Create / edit ----------
export function customerForm(existing = null) { return partyForm('customer', existing); }

export function partyForm(kind, existing = null) {
  const s = store.get();
  const isDealer = kind === 'dealer';
  const body = `<div class="grid-form">
      <label class="field"><span>Name</span><input name="name" required value="${esc(existing?.name || '')}" autocomplete="off"></label>
      <label class="field"><span>Contact</span><input name="contact" inputmode="tel" value="${esc(existing?.contact || '')}"></label>
      <label class="field span-2"><span>Address</span><input name="address" value="${esc(existing?.address || '')}"></label>
      <label class="field"><span>City / postal / province</span><input name="city" value="${esc(existing?.city || '')}"></label>
      <label class="field"><span>Opening balance (Rs)</span><input name="opening" type="number" step="any" inputmode="decimal" value="${existing?.opening ?? 0}"></label>
      <label class="field"><span>Opening balance as of</span><input name="openingDate" type="date" value="${existing?.openingDate || ''}"></label>
    </div>
    <p class="hint">${isDealer ? 'Opening balance: positive if we already owe this dealer.' : 'Opening balance: positive if this customer already owes us.'}</p>
    ${isDealer ? `<div class="field"><span>Supplies</span><div class="check-row">${s.products.map((p) => `<label class="check"><input type="checkbox" name="products" value="${esc(p.name)}" ${(existing?.productNames || []).includes(p.name) ? 'checked' : ''}><span>${icon(productLook(p.name).icon)} ${esc(p.name)}</span></label>`).join('')}</div></div>` : ''}`;
  return formModal({
    title: existing ? `Edit ${isDealer ? 'dealer' : 'customer'}` : (isDealer ? 'Add dealer' : 'Add customer'),
    body,
    submitLabel: existing ? 'Save changes' : 'Add',
    onSubmit: async (v, el) => {
      const productNames = [...el.querySelectorAll('input[name=products]:checked')].map((i) => i.value);
      let id = null;
      await store.mutate((d) => { id = upsertParty(d, kind, { ...v, id: existing?.id, productNames }); });
      return store.get()[kind === 'customer' ? 'customers' : 'dealers'].find((p) => p.id === id);
    },
  });
}
