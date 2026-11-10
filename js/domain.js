// Business rules for the building-materials ledger. Pure functions only (no DOM, no storage), so they can be tested with node.
//
// Model (taken from the "Data Entry Form Shakeel Sons" workbook):
//   purchases  – entries from dealers/suppliers (Form sheet). Total = Qty × Price + Freight.
//   invoices   – sales bills to customers (Bill sheet). Amount = lines + Freight + Labour charges;
//                Remainder = Amount + Arrears − Deposit.
//   payments   – money received from customers (dir 'in') or paid to dealers (dir 'out'). Deposits and "paid now"
//                amounts are payments linked to the invoice or purchase they came with.
//   adjustments– stock corrections.
//
// Ledgers: every customer and dealer has a running ledger. Payments settle the oldest open item first (the opening
// balance, then invoices/purchases by date), which gives the "Paid / Partly paid / Unpaid" status of each document.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
export const num = (v, def = 0) => {
  if (v === null || v === undefined || v === '') return def;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : def;
};
export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | 0).toString(16)));
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const invoiceLabel = (state, no) => `${state.invoice.prefix}${String(no).padStart(5, '0')}`;
export const purchaseLabel = (no) => `P${String(no).padStart(4, '0')}`;
export const itemId = (product, brand = '', quality = '') => [product, brand, quality].map((s) => String(s ?? '').trim()).join('|');
export const itemName = (it) => [it.product, it.brand, it.quality].filter(Boolean).join(' · ');

export const lineTotal = (qty, price) => round2(num(qty) * num(price));
export const purchaseTotal = ({ qty, price, freight }) => round2(num(qty) * num(price) + num(freight));

// Bill totals: lines, plus freight and labour charges (both are billed), plus arrears, less the deposit.
export function invoiceTotals(lines, arrears = 0, deposit = 0, freight = 0, labour = 0) {
  const subtotal = round2(lines.reduce((s, l) => s + num(l.total), 0));
  const fr = round2(num(freight));
  const lb = round2(num(labour));
  const amount = round2(subtotal + fr + lb);
  return {
    subtotal, freight: fr, labour: lb, amount,
    arrears: round2(num(arrears)), deposit: round2(num(deposit)), remainder: round2(amount + num(arrears) - num(deposit)),
  };
}

const cmpDoc = (a, b) => (a.date.localeCompare(b.date)) || ((a.no || 0) - (b.no || 0)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));

// Settles documents oldest first with the total paid. docs: [{id, date, no, amount, createdAt}] (already sorted).
// Returns Map id → { amount, paid, due, status }.
export function allocate(docs, paidTotal) {
  const out = new Map();
  let pool = round2(Math.max(0, paidTotal));
  for (const d of docs) {
    const amount = round2(d.amount);
    const applied = round2(Math.min(amount, pool));
    pool = round2(pool - applied);
    const due = round2(amount - applied);
    const status = due <= 0.004 ? 'Paid' : applied > 0 ? 'Partly paid' : 'Unpaid';
    out.set(d.id, { amount, paid: applied, due, status });
  }
  return out;
}

const sumBy = (list, f) => round2(list.reduce((s, x) => s + num(f(x)), 0));
const payTotal = (state, dir, partyId) => sumBy(state.payments.filter((p) => p.dir === dir && p.partyId === partyId), (p) => p.amount);

// ---------- Customers & dealers ----------
const openingDocId = (partyId) => `opening:${partyId}`;

function customerDocs(state, customerId) {
  const c = state.customers.find((x) => x.id === customerId);
  const docs = [];
  if (c && num(c.opening) !== 0) docs.push({ id: openingDocId(customerId), date: c.openingDate || c.createdAt.slice(0, 10), no: 0, amount: c.opening, createdAt: c.createdAt });
  for (const inv of state.invoices.filter((i) => i.customerId === customerId)) docs.push({ id: inv.id, date: inv.date, no: inv.no, amount: inv.amount, createdAt: inv.createdAt });
  return docs.sort(cmpDoc);
}
function dealerDocs(state, dealerId) {
  const d = state.dealers.find((x) => x.id === dealerId);
  const docs = [];
  if (d && num(d.opening) !== 0) docs.push({ id: openingDocId(dealerId), date: d.openingDate || d.createdAt.slice(0, 10), no: 0, amount: d.opening, createdAt: d.createdAt });
  for (const p of state.purchases.filter((x) => x.dealerId === dealerId)) docs.push({ id: p.id, date: p.date, no: p.no, amount: p.total, createdAt: p.createdAt });
  return docs.sort(cmpDoc);
}

// Balance a customer carried into a bill: the bill itself (and its deposit) is left out when invoiceId is given.
export const arrearsFor = (state, customerId, invoiceId = null) => customerBalance(invoiceId ? withoutInvoice(state, invoiceId) : state, customerId);

export function customerBalance(state, customerId) {
  const c = state.customers.find((x) => x.id === customerId);
  const billed = sumBy(state.invoices.filter((i) => i.customerId === customerId), (i) => i.amount);
  return round2(num(c?.opening) + billed - payTotal(state, 'in', customerId));
}
export function dealerBalance(state, dealerId) {
  const d = state.dealers.find((x) => x.id === dealerId);
  const bought = sumBy(state.purchases.filter((p) => p.dealerId === dealerId), (p) => p.total);
  return round2(num(d?.opening) + bought - payTotal(state, 'out', dealerId));
}

// Status of every invoice and purchase, from the oldest-first settlement. Also keyed by opening:<partyId>.
export function documentStatus(state) {
  const map = new Map();
  for (const c of state.customers) {
    const m = allocate(customerDocs(state, c.id), payTotal(state, 'in', c.id));
    m.forEach((v, k) => map.set(k, { ...v, partyId: c.id }));
  }
  for (const d of state.dealers) {
    const m = allocate(dealerDocs(state, d.id), payTotal(state, 'out', d.id));
    m.forEach((v, k) => map.set(k, { ...v, partyId: d.id }));
  }
  return map;
}

// Ledger rows for a party. kind 'customer': debits are billed, credits are received.
// kind 'dealer': credits are purchases, debits are payments made; balance is what we still owe.
export function ledger(state, kind, partyId) {
  const isCustomer = kind === 'customer';
  const party = (isCustomer ? state.customers : state.dealers).find((x) => x.id === partyId);
  if (!party) return { rows: [], balance: 0, totals: {} };
  const entries = [];
  if (num(party.opening) !== 0) {
    entries.push({ date: party.openingDate || party.createdAt.slice(0, 10), createdAt: party.createdAt, kind: 'opening', ref: 'Opening', desc: 'Opening balance', amount: num(party.opening), side: isCustomer ? 'debit' : 'credit' });
  }
  if (isCustomer) {
    for (const i of state.invoices.filter((x) => x.customerId === partyId)) {
      entries.push({ date: i.date, createdAt: i.createdAt, kind: 'invoice', id: i.id, ref: invoiceLabel(state, i.no), desc: `Bill · ${i.lines.length} item(s)`, amount: i.amount, side: 'debit' });
    }
  } else {
    for (const p of state.purchases.filter((x) => x.dealerId === partyId)) {
      entries.push({ date: p.date, createdAt: p.createdAt, kind: 'purchase', id: p.id, ref: purchaseLabel(p.no), desc: `${itemName(p)} · ${p.qty} ${p.unit}`, amount: p.total, side: 'credit' });
    }
  }
  for (const p of state.payments.filter((x) => x.partyId === partyId)) {
    const received = p.dir === 'in';
    entries.push({ date: p.date, createdAt: p.createdAt, kind: 'payment', id: p.id, ref: p.method || 'Payment', desc: p.note || (received ? 'Payment received' : 'Payment made'), amount: p.amount, side: received ? 'credit' : 'debit' });
  }
  entries.sort((a, b) => (a.date.localeCompare(b.date)) || (a.kind === 'opening' ? -1 : b.kind === 'opening' ? 1 : 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  // Balance is always positive when the party owes us (customers) or when we owe them (dealers).
  const sign = isCustomer ? 1 : -1;
  let running = 0;
  const rows = entries.map((e) => {
    running = round2(running + sign * (e.side === 'debit' ? 1 : -1) * e.amount);
    return { ...e, debit: e.side === 'debit' ? e.amount : 0, credit: e.side === 'credit' ? e.amount : 0, balance: running };
  });
  const totals = {
    debit: sumBy(rows, (r) => r.debit), credit: sumBy(rows, (r) => r.credit),
  };
  return { rows, balance: running, totals };
}

// ---------- Stock ----------
export function stockByItem(state) {
  const stock = new Map();
  const add = (id, q) => stock.set(id, round3((stock.get(id) || 0) + q));
  for (const p of state.purchases) {
    if (p.entryType === 'Purchasing') add(p.itemId, num(p.qty));
    else if (p.entryType === 'Selling') add(p.itemId, -num(p.qty));
  }
  for (const i of state.invoices) for (const l of i.lines) add(l.itemId, -num(l.qty));
  for (const a of state.adjustments) add(a.itemId, num(a.qty));
  return stock;
}

export function stockMovements(state) {
  const rows = [];
  for (const p of state.purchases) {
    if (p.entryType === 'Trading') continue;
    rows.push({ date: p.date, createdAt: p.createdAt, itemId: p.itemId, product: p.product, brand: p.brand, quality: p.quality, unit: p.unit, qty: p.entryType === 'Selling' ? -num(p.qty) : num(p.qty), type: p.entryType === 'Selling' ? 'Sold (entry)' : 'Received', ref: purchaseLabel(p.no) });
  }
  for (const i of state.invoices) {
    for (const l of i.lines) rows.push({ date: i.date, createdAt: i.createdAt, itemId: l.itemId, product: l.product, brand: l.brand, quality: l.quality, unit: l.unit, qty: -num(l.qty), type: 'Sold', ref: invoiceLabel(state, i.no) });
  }
  for (const a of state.adjustments) {
    const it = state.items.find((x) => x.id === a.itemId) || {};
    rows.push({ date: a.date, createdAt: a.createdAt, itemId: a.itemId, product: it.product || '', brand: it.brand || '', quality: it.quality || '', unit: it.unit || state.products.find((p) => p.name === it.product)?.unit || '', qty: num(a.qty), type: 'Adjustment', ref: a.note || 'Stock count' });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Units for a product line; items carry their product's unit.
export const unitOf = (state, product) => state.products.find((p) => p.name === product)?.unit || '';

// Lines whose quantity is more than the stock on hand (stock is checked before a bill is saved).
export function stockShortages(state, lines) {
  const stock = stockByItem(state);
  const need = new Map();
  for (const l of lines) need.set(l.itemId, round3((need.get(l.itemId) || 0) + num(l.qty)));
  return [...need].filter(([id, q]) => (stock.get(id) || 0) - q < -0.0001)
    .map(([id, q]) => ({ itemId: id, need: q, have: stock.get(id) || 0 }));
}

// ---------- Mutations (operate on a draft state; throw on invalid input) ----------
const fail = (msg) => { throw new Error(msg); };

export function addProduct(state, { name, unit }) {
  const n = String(name || '').trim();
  if (!n) fail('Enter the product name.');
  if (state.products.some((p) => p.name.toLowerCase() === n.toLowerCase())) fail('This product already exists.');
  state.products.push({ name: n, unit: String(unit || 'Units').trim() });
}

export function addItem(state, { product, brand = '', quality = '', price = null }) {
  if (!state.products.some((p) => p.name === product)) fail('Choose a product.');
  const id = itemId(product, brand, quality);
  if (state.items.some((i) => i.id === id)) fail('This brand and quality is already in the price index.');
  state.items.push({ id, product, brand: String(brand).trim(), quality: String(quality).trim(), unit: unitOf(state, product), price: price === null ? null : round2(price) });
  return id;
}

export function setPrices(state, changes) {
  for (const { id, price } of changes) {
    const it = state.items.find((x) => x.id === id);
    if (it) it.price = price === null ? null : round2(Math.max(0, price));
  }
}

export function upsertParty(state, kind, data) {
  const list = kind === 'customer' ? state.customers : state.dealers;
  const name = String(data.name || '').trim();
  if (!name) fail('Enter the name.');
  if (list.some((p) => p.id !== data.id && p.name.toLowerCase() === name.toLowerCase())) fail('A party with this name already exists.');
  const row = {
    name, contact: String(data.contact || '').trim(), address: String(data.address || '').trim(),
    city: String(data.city || '').trim(), opening: round2(num(data.opening)), openingDate: data.openingDate || null,
  };
  if (kind === 'dealer') row.productNames = data.productNames || [];
  const existing = data.id && list.find((p) => p.id === data.id);
  if (existing) { Object.assign(existing, row); return existing.id; }
  const created = { id: uid(), ...row, createdAt: new Date().toISOString() };
  list.push(created);
  return created.id;
}

export function deleteParty(state, kind, id) {
  if (kind === 'customer') {
    if (state.invoices.some((i) => i.customerId === id)) fail('This customer has bills. Keep the record for the ledger.');
    state.customers = state.customers.filter((c) => c.id !== id);
  } else {
    if (state.purchases.some((p) => p.dealerId === id)) fail('This dealer has purchases. Keep the record for the ledger.');
    state.dealers = state.dealers.filter((d) => d.id !== id);
  }
  state.payments = state.payments.filter((p) => p.partyId !== id);
}

// Older saves kept Rent as a deduction. It is now Freight, which is added to the total.
export function migrateState(state) {
  for (const p of state.purchases) {
    if (p.freight === undefined) {
      p.freight = round2(num(p.rent));
      p.total = purchaseTotal({ qty: p.qty, price: p.price, freight: p.freight });
    }
    delete p.rent;
  }
  return state;
}

const money2 = (v, label) => {
  const n = round2(num(v));
  if (n < 0) fail(`${label} cannot be negative.`);
  return n;
};

// Checks a purchase form and returns the values to store. Credit means nothing is paid now.
function purchaseRecord(state, { dealerId, itemId: id, qty, price, freight = 0, entryType = 'Purchasing', paidNow = 0, payment = 'Cash' }) {
  const item = state.items.find((i) => i.id === id);
  if (!item) fail('Choose an item from the price index.');
  const dealer = state.dealers.find((d) => d.id === dealerId);
  if (!dealer) fail('Choose the dealer.');
  if (!PURCHASE_TYPES.includes(entryType)) fail('Choose Purchasing or Trading.');
  const q = round3(num(qty));
  if (!(q > 0)) fail('Quantity must be more than zero.');
  const p = money2(price, 'Price');
  const f = money2(freight, 'Freight');
  const total = purchaseTotal({ qty: q, price: p, freight: f });
  const credit = payment === 'Credit';
  if (credit && num(paidNow) > 0) fail('A credit purchase has nothing paid now. Set paid now to 0 or choose a payment method.');
  const paid = credit ? 0 : money2(paidNow, 'Paid now');
  if (paid > total + 0.004) fail('Paid now cannot be more than the purchase total.');
  return {
    dealerId: dealer.id, dealerName: dealer.name, itemId: item.id,
    product: item.product, brand: item.brand, quality: item.quality, unit: unitOf(state, item.product),
    entryType, qty: q, price: p, freight: f, total, payment, paidNow: paid,
  };
}
const PURCHASE_TYPES = ['Purchasing', 'Trading'];

// The paid-now amount is a payment linked to its purchase; it is rewritten whenever the purchase changes.
function setPurchasePayment(state, row) {
  state.payments = state.payments.filter((p) => !(p.refType === 'purchase' && p.refId === row.id));
  if (row.paidNow > 0) state.payments.push({ id: uid(), date: row.date, dir: 'out', partyId: row.dealerId, amount: row.paidNow, method: row.payment, note: `Paid with ${purchaseLabel(row.no)}`, refType: 'purchase', refId: row.id, createdAt: row.createdAt });
}

export function addPurchase(state, data) {
  const rec = purchaseRecord(state, data);
  const no = state.purchaseNo.next;
  state.purchaseNo.next += 1;
  const row = { id: uid(), no, date: data.date || localDate(), ...rec, createdAt: data.createdAt || new Date().toISOString() };
  state.purchases.push(row);
  setPurchasePayment(state, row);
  return row;
}

export function updatePurchase(state, id, data) {
  const row = state.purchases.find((p) => p.id === id);
  if (!row) fail('This entry no longer exists.');
  Object.assign(row, { date: data.date || row.date, ...purchaseRecord(state, data), updatedAt: new Date().toISOString() });
  setPurchasePayment(state, row);
  return row;
}

// The deposit is a payment linked to its bill; it is rewritten whenever the bill changes.
function setInvoiceDeposit(state, inv, dep, method, createdAt) {
  state.payments = state.payments.filter((p) => !(p.refType === 'invoice' && p.refId === inv.id));
  if (dep > 0) state.payments.push({ id: uid(), date: inv.date, dir: 'in', partyId: inv.customerId, amount: dep, method, note: `Deposit on ${invoiceLabel(state, inv.no)}`, refType: 'invoice', refId: inv.id, createdAt });
}

// Checks bill lines and returns the stored lines.
function cleanBillLines(state, lines) {
  if (!lines || !lines.length) fail('Add at least one item to the bill.');
  return lines.map((l) => {
    const item = state.items.find((i) => i.id === l.itemId);
    if (!item) fail(`Item not in the price index: ${l.product || 'unknown'}.`);
    const qty = round3(num(l.qty));
    const price = round2(num(l.price));
    if (!(qty > 0)) fail(`Quantity for ${itemName(item)} must be more than zero.`);
    if (price < 0) fail(`Price for ${itemName(item)} cannot be negative.`);
    return { itemId: item.id, product: item.product, brand: item.brand, quality: item.quality, unit: unitOf(state, item.product), qty, price, total: lineTotal(qty, price) };
  });
}

// The state as it was before a bill and its deposit were written.
function withoutInvoice(state, id) {
  return { ...state, invoices: state.invoices.filter((i) => i.id !== id), payments: state.payments.filter((p) => !(p.refType === 'invoice' && p.refId === id)) };
}

export function addInvoice(state, { date, customerId, lines, deposit = 0, depositMethod = 'Cash', freight = 0, labour = 0, createdAt = new Date().toISOString() }) {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) fail('Choose the customer.');
  const clean = cleanBillLines(state, lines);
  const dep = money2(deposit, 'Deposit');
  const fr = money2(freight, 'Freight');
  const lb = money2(labour, 'Labour charges');
  const arrears = customerBalance(state, customerId);
  const no = state.invoice.next;
  state.invoice.next += 1;
  const invoice = {
    id: uid(), no, date: date || localDate(), customerId, customerName: customer.name, contact: customer.contact,
    address: customer.address, city: customer.city, lines: clean, ...invoiceTotals(clean, arrears, dep, fr, lb), createdAt,
  };
  state.invoices.push(invoice);
  setInvoiceDeposit(state, invoice, dep, depositMethod, createdAt);
  return invoice;
}

// Rewrites a saved bill. Its number stays the same; arrears are what the customer owed before this bill.
export function updateInvoice(state, id, { date, customerId, lines, deposit = 0, depositMethod = 'Cash', freight = 0, labour = 0 }) {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) fail('This bill no longer exists.');
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) fail('Choose the customer.');
  const clean = cleanBillLines(state, lines);
  const dep = money2(deposit, 'Deposit');
  const fr = money2(freight, 'Freight');
  const lb = money2(labour, 'Labour charges');
  const arrears = customerBalance(withoutInvoice(state, id), customerId);
  Object.assign(inv, {
    date: date || inv.date, customerId, customerName: customer.name, contact: customer.contact,
    address: customer.address, city: customer.city, lines: clean, ...invoiceTotals(clean, arrears, dep, fr, lb), updatedAt: new Date().toISOString(),
  });
  setInvoiceDeposit(state, inv, dep, depositMethod, inv.createdAt);
  return inv;
}

export function addPayment(state, { dir, partyId, date, amount, method = 'Cash', note = '', createdAt = new Date().toISOString() }) {
  const party = (dir === 'in' ? state.customers : state.dealers).find((p) => p.id === partyId);
  if (!party) fail('Choose the party.');
  const a = round2(num(amount));
  if (!(a > 0)) fail('Enter an amount more than zero.');
  const row = { id: uid(), date: date || localDate(), dir, partyId, amount: a, method, note: String(note || '').trim(), refType: null, refId: null, createdAt };
  state.payments.push(row);
  return row;
}

// Deleting a bill or purchase also removes the deposit / paid-now payment that came with it.
export function deleteInvoice(state, id) {
  state.invoices = state.invoices.filter((i) => i.id !== id);
  state.payments = state.payments.filter((p) => !(p.refType === 'invoice' && p.refId === id));
}
export function deletePurchase(state, id) {
  state.purchases = state.purchases.filter((p) => p.id !== id);
  state.payments = state.payments.filter((p) => !(p.refType === 'purchase' && p.refId === id));
}
export function deletePayment(state, id) {
  state.payments = state.payments.filter((p) => p.id !== id);
}

export function addAdjustment(state, { date, itemId: id, qty, note = '' }) {
  if (!state.items.some((i) => i.id === id)) fail('Choose an item.');
  const q = round3(num(qty));
  if (!q) fail('Enter a quantity other than zero (use a minus sign to reduce stock).');
  state.adjustments.push({ id: uid(), date: date || localDate(), itemId: id, qty: q, note: String(note).trim(), createdAt: new Date().toISOString() });
}

export function setNextInvoiceNo(state, n) {
  const last = state.invoices.reduce((m, i) => Math.max(m, i.no), 0);
  if (!(Number.isInteger(n) && n > last)) fail(`The next bill number must be a whole number above ${last}.`);
  state.invoice.next = n;
}

// ---------- Reports ----------
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

export function salesReport(state, from = '', to = '') {
  const status = documentStatus(state);
  const invoices = state.invoices.filter((i) => inRange(i.date, from, to)).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const total = sumBy(invoices, (i) => i.amount);
  const byMonth = new Map();
  const byProduct = new Map();
  const byCustomer = new Map();
  for (const i of invoices) {
    const m = i.date.slice(0, 7);
    byMonth.set(m, round2((byMonth.get(m) || 0) + i.amount));
    for (const l of i.lines) {
      const cur = byProduct.get(l.product) || { product: l.product, unit: l.unit, qty: 0, amount: 0 };
      cur.qty = round3(cur.qty + l.qty); cur.amount = round2(cur.amount + l.total);
      byProduct.set(l.product, cur);
    }
    const c = byCustomer.get(i.customerId) || { customerId: i.customerId, name: i.customerName, count: 0, amount: 0 };
    c.count += 1; c.amount = round2(c.amount + i.amount);
    byCustomer.set(i.customerId, c);
  }
  const outstanding = sumBy(invoices, (i) => status.get(i.id)?.due ?? 0);
  const collected = sumBy(state.payments.filter((p) => p.dir === 'in' && inRange(p.date, from, to)), (p) => p.amount);
  return {
    invoices, total, count: invoices.length, average: invoices.length ? round2(total / invoices.length) : 0,
    byMonth: [...byMonth].sort((a, b) => a[0].localeCompare(b[0])).map(([month, amount]) => ({ month, amount })),
    byProduct: [...byProduct.values()].sort((a, b) => b.amount - a.amount),
    byCustomer: [...byCustomer.values()].sort((a, b) => b.amount - a.amount),
    outstanding, collected, status,
  };
}

export function purchaseReport(state, from = '', to = '') {
  const purchases = state.purchases.filter((p) => inRange(p.date, from, to)).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const byDealer = new Map();
  const byProduct = new Map();
  for (const p of purchases) {
    const d = byDealer.get(p.dealerId) || { dealerId: p.dealerId, name: p.dealerName, count: 0, amount: 0 };
    d.count += 1; d.amount = round2(d.amount + p.total); byDealer.set(p.dealerId, d);
    const pr = byProduct.get(p.product) || { product: p.product, unit: p.unit, qty: 0, amount: 0 };
    pr.qty = round3(pr.qty + p.qty); pr.amount = round2(pr.amount + p.total); byProduct.set(p.product, pr);
  }
  return {
    purchases, total: sumBy(purchases, (p) => p.total), count: purchases.length,
    paid: sumBy(state.payments.filter((p) => p.dir === 'out' && inRange(p.date, from, to)), (p) => p.amount),
    byDealer: [...byDealer.values()].sort((a, b) => b.amount - a.amount),
    byProduct: [...byProduct.values()].sort((a, b) => b.amount - a.amount),
  };
}

// Open receivables by age (days since the bill date). Opening balances are aged from their own date.
export function agingReport(state, asOf = localDate()) {
  const status = documentStatus(state);
  const bucket = (days) => (days <= 30 ? 'd0' : days <= 60 ? 'd31' : days <= 90 ? 'd61' : 'd90');
  const rows = state.customers.map((c) => {
    const r = { customerId: c.id, name: c.name, d0: 0, d31: 0, d61: 0, d90: 0, total: 0 };
    const docs = [];
    if (num(c.opening) !== 0) docs.push({ id: openingDocId(c.id), date: c.openingDate || c.createdAt.slice(0, 10) });
    for (const i of state.invoices.filter((x) => x.customerId === c.id)) docs.push({ id: i.id, date: i.date });
    for (const d of docs) {
      const s = status.get(d.id);
      if (!s || s.due <= 0.004) continue;
      const days = Math.max(0, Math.floor((new Date(asOf) - new Date(d.date)) / 86400000));
      r[bucket(days)] = round2(r[bucket(days)] + s.due);
      r.total = round2(r.total + s.due);
    }
    return r;
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const totals = ['d0', 'd31', 'd61', 'd90', 'total'].reduce((o, k) => ({ ...o, [k]: sumBy(rows, (r) => r[k]) }), {});
  return { rows, totals, asOf };
}

export function stockValuation(state) {
  const stock = stockByItem(state);
  const rows = state.items.map((it) => {
    const qty = stock.get(it.id) || 0;
    return { ...it, unit: unitOf(state, it.product), qty, value: round2(Math.max(0, qty) * num(it.price)) };
  });
  return { rows, total: sumBy(rows, (r) => r.value) };
}

// Last n months ending with the month of asOf (YYYY-MM keys, amounts of bills dated in that month).
export function monthlySales(state, n = 12, asOf = localDate()) {
  const [y, m] = asOf.split('-').map(Number);
  const keys = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(y, m - 1 - k, 1);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return keys.map((key) => ({ key, amount: sumBy(state.invoices.filter((i) => i.date.startsWith(key)), (i) => i.amount) }));
}

export function totalsSummary(state, asOf = localDate()) {
  const month = asOf.slice(0, 7);
  const status = documentStatus(state);
  const receivables = state.customers.reduce((s, c) => s + Math.max(0, customerBalance(state, c.id)), 0);
  const payables = state.dealers.reduce((s, d) => s + Math.max(0, dealerBalance(state, d.id)), 0);
  const val = stockValuation(state);
  return {
    today: sumBy(state.invoices.filter((i) => i.date === asOf), (i) => i.amount),
    month: sumBy(state.invoices.filter((i) => i.date.startsWith(month)), (i) => i.amount),
    receivables: round2(receivables), payables: round2(payables),
    stockValue: val.total,
    outOfStock: val.rows.filter((r) => r.qty <= 0).length,
    openBills: [...status.values()].filter((s) => s.due > 0.004 && s.partyId && s.amount > 0).length,
    items: state.items.length,
  };
}
