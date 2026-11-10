// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/domain.js';
import { seedState } from '../js/seed.js';

const fresh = () => seedState('2026-01-01T00:00:00.000Z');
const cust = (s, name) => s.customers.find((c) => c.name === name);
const dealer = (s, name) => s.dealers.find((d) => d.name === name);
const item = (s, product, brand = '', quality = '') => s.items.find((i) => i.id === D.itemId(product, brand, quality));

test('Form sheet: purchase total = qty × price + freight', () => {
  assert.equal(D.purchaseTotal({ qty: 600, price: 1390, freight: 80000 }), 914000);
});

test('Bill sheet: amount, arrears and remainder match the Excel invoice 4738', () => {
  const lines = [[700, 1450], [55, 235], [7000, 18], [250, 200], [50, 65], [5, 550]].map(([qty, price]) => ({ total: D.lineTotal(qty, price) }));
  const t = D.invoiceTotals(lines, 0, 950000);
  assert.equal(t.amount, 1209925);
  assert.equal(t.remainder, 259925);
});

test('Seed: 94 price rows, 9 products, 13 customers, 7 dealers, next bill S04739', () => {
  const s = fresh();
  assert.equal(s.items.length, 94);
  assert.equal(s.products.length, 9);
  assert.equal(s.customers.length, 13);
  assert.equal(s.dealers.length, 7);
  assert.equal(s.invoice.next, 4739);
  assert.equal(D.invoiceLabel(s, 4739), 'S04739');
});

test('FIFO settlement: payment clears the oldest bill first', () => {
  const m = D.allocate([
    { id: 'a', date: '2026-01-01', amount: 100 },
    { id: 'b', date: '2026-01-02', amount: 50 },
  ], 120);
  assert.equal(m.get('a').status, 'Paid');
  assert.equal(m.get('b').status, 'Partly paid');
  assert.equal(m.get('b').due, 30);
  assert.equal(D.allocate([{ id: 'x', date: '2026-01-01', amount: 10 }], 0).get('x').status, 'Unpaid');
});

test('Customer ledger: deposit reduces the balance and the next bill starts with that arrears', () => {
  const s = fresh();
  const c = cust(s, 'Hannan Mir');
  const hm = item(s, 'Cement', 'Paidar');
  const inv1 = D.addInvoice(s, { date: '2026-07-29', customerId: c.id, lines: [{ itemId: hm.id, product: 'Cement', qty: 700, price: 1450 }], deposit: 500000 });
  assert.equal(inv1.amount, 1015000);
  assert.equal(inv1.arrears, 0);
  assert.equal(inv1.remainder, 515000);
  assert.equal(D.customerBalance(s, c.id), 515000);
  const inv2 = D.addInvoice(s, { date: '2026-08-01', customerId: c.id, lines: [{ itemId: hm.id, product: 'Cement', qty: 10, price: 1000 }] });
  assert.equal(inv2.arrears, 515000, 'arrears come from the ledger');
  assert.equal(inv2.remainder, 525000);
  const st = D.documentStatus(s);
  assert.equal(st.get(inv1.id).status, 'Partly paid');
  assert.equal(st.get(inv2.id).status, 'Unpaid');
});

test('Customer ledger rows run in date order and end at the balance', () => {
  const s = fresh();
  const c = cust(s, 'Adam Muneeb');
  s.customers.find((x) => x.id === c.id).opening = 1000;
  s.customers.find((x) => x.id === c.id).openingDate = '2026-01-01';
  const hm = item(s, 'Steel', 'GM', '60 Guage');
  D.addInvoice(s, { date: '2026-02-01', customerId: c.id, lines: [{ itemId: hm.id, qty: 10, price: 250 }] });
  D.addPayment(s, { dir: 'in', partyId: c.id, date: '2026-02-05', amount: 1500 });
  const { rows, balance } = D.ledger(s, 'customer', c.id);
  assert.deepEqual(rows.map((r) => r.kind), ['opening', 'invoice', 'payment']);
  assert.equal(rows.at(-1).balance, balance);
  assert.equal(balance, 2000, 'opening 1000 + bill 2500 − payment 1500');
});

test('Dealer ledger: purchase adds to what we owe, paid-now and later payments reduce it', () => {
  const s = fresh();
  const d = dealer(s, 'Sadaat');
  const cement = item(s, 'Cement', 'Paidar');
  D.addPurchase(s, { date: '2026-07-01', dealerId: d.id, itemId: cement.id, qty: 600, price: 1390, freight: 80000, paidNow: 500000 });
  assert.equal(D.dealerBalance(s, d.id), 414000);
  const { balance, rows } = D.ledger(s, 'dealer', d.id);
  assert.equal(balance, 414000, 'dealer balance is positive when we owe');
  assert.deepEqual(rows.map((r) => r.kind), ['purchase', 'payment']);
  D.addPayment(s, { dir: 'out', partyId: d.id, date: '2026-07-10', amount: 414000 });
  assert.equal(D.dealerBalance(s, d.id), 0);
});

test('Stock: purchases in, bills out, adjustments signed, trading does not move stock', () => {
  const s = fresh();
  const d = dealer(s, 'Sadaat');
  const cement = item(s, 'Cement', 'Paidar');
  D.addPurchase(s, { date: '2026-07-01', dealerId: d.id, itemId: cement.id, qty: 600, price: 1390 });
  D.addPurchase(s, { date: '2026-07-02', dealerId: d.id, itemId: cement.id, qty: 100, price: 1390, entryType: 'Trading' });
  const c = cust(s, 'Hannan Mir');
  D.addInvoice(s, { date: '2026-07-03', customerId: c.id, lines: [{ itemId: cement.id, qty: 200, price: 1450 }] });
  D.addAdjustment(s, { date: '2026-07-04', itemId: cement.id, qty: -5, note: 'damaged' });
  assert.equal(D.stockByItem(s).get(cement.id), 395);
  assert.equal(D.stockMovements(s).length, 3, 'trading entries are not stock movements');
});

test('Stock shortages are reported before a bill is saved', () => {
  const s = fresh();
  const cement = item(s, 'Cement', 'Paidar');
  const short = D.stockShortages(s, [{ itemId: cement.id, qty: 700 }]);
  assert.equal(short.length, 1);
  assert.equal(short[0].have, 0);
});

test('Deleting a bill removes its deposit and restores the balance', () => {
  const s = fresh();
  const c = cust(s, 'Rizwan Abid');
  const sand = item(s, 'Sand', '', 'Tawi');
  const inv = D.addInvoice(s, { date: '2026-03-01', customerId: c.id, lines: [{ itemId: sand.id, qty: 50, price: 65 }], deposit: 1000 });
  assert.equal(D.customerBalance(s, c.id), 2250);
  D.deleteInvoice(s, inv.id);
  assert.equal(D.customerBalance(s, c.id), 0);
  assert.equal(s.payments.length, 0);
});

test('Deleting a purchase removes its paid-now payment and stock', () => {
  const s = fresh();
  const d = dealer(s, 'Qaiser');
  const steel = item(s, 'Steel', 'Malik', '60 Guage');
  const p = D.addPurchase(s, { date: '2026-03-01', dealerId: d.id, itemId: steel.id, qty: 1000, price: 265, paidNow: 100000 });
  D.deletePurchase(s, p.id);
  assert.equal(D.dealerBalance(s, d.id), 0);
  assert.equal(D.stockByItem(s).get(steel.id) ?? 0, 0);
});

test('Validation: zero quantities, unknown items and overpayment are refused', () => {
  const s = fresh();
  const c = cust(s, 'Hannan Mir');
  const cement = item(s, 'Cement', 'Paidar');
  assert.throws(() => D.addInvoice(s, { customerId: c.id, lines: [{ itemId: cement.id, qty: 0, price: 1 }] }), /more than zero/);
  assert.throws(() => D.addInvoice(s, { customerId: c.id, lines: [{ itemId: 'nope', qty: 1, price: 1 }] }), /not in the price index/);
  const d = dealer(s, 'Sadaat');
  assert.throws(() => D.addPurchase(s, { dealerId: d.id, itemId: cement.id, qty: 10, price: 100, paidNow: 99999 }), /more than the purchase total/);
  D.addInvoice(s, { customerId: c.id, lines: [{ itemId: cement.id, qty: 1, price: 1 }] });
  assert.throws(() => D.deleteParty(s, 'customer', c.id), /has bills/);
  assert.throws(() => D.addAdjustment(s, { itemId: cement.id, qty: 0 }), /other than zero/);
});

test('Aging: open bills are bucketed by age and paid bills are left out', () => {
  const s = fresh();
  const c = cust(s, 'Aneeq Kashif');
  const sand = item(s, 'Sand', '', 'Tawi');
  D.addInvoice(s, { date: '2026-01-01', customerId: c.id, lines: [{ itemId: sand.id, qty: 100, price: 70 }] });
  D.addInvoice(s, { date: '2026-06-20', customerId: c.id, lines: [{ itemId: sand.id, qty: 10, price: 70 }] });
  const r = D.agingReport(s, '2026-07-01').rows.find((x) => x.customerId === c.id);
  assert.equal(r.d90, 7000);
  assert.equal(r.d0, 700);
  assert.equal(r.total, 7700);
});

test('Sales report totals, month series and collections', () => {
  const s = fresh();
  const c = cust(s, 'Fahad Shakeel');
  const sand = item(s, 'Sand', '', 'Tawi');
  D.addInvoice(s, { date: '2026-05-10', customerId: c.id, lines: [{ itemId: sand.id, qty: 10, price: 70 }], deposit: 300 });
  D.addInvoice(s, { date: '2026-06-10', customerId: c.id, lines: [{ itemId: sand.id, qty: 20, price: 70 }] });
  const r = D.salesReport(s, '2026-05-01', '2026-06-30');
  assert.equal(r.total, 2100);
  assert.equal(r.count, 2);
  assert.equal(r.collected, 300);
  assert.equal(r.byMonth.length, 2);
  assert.equal(D.monthlySales(s, 12, '2026-06-15').length, 12);
});

test('Invoice numbers must be above the last saved bill', () => {
  const s = fresh();
  D.addInvoice(s, { customerId: cust(s, 'Hannan Mir').id, lines: [{ itemId: item(s, 'Sand', '', 'Tawi').id, qty: 1, price: 1 }] });
  assert.equal(s.invoice.next, 4740);
  assert.throws(() => D.setNextInvoiceNo(s, 4739), /above/);
  D.setNextInvoiceNo(s, 5000);
  assert.equal(s.invoice.next, 5000);
});

test('Bill: freight and labour charges are added to the bill amount', () => {
  const s = fresh();
  const c = cust(s, 'Hannan Mir');
  const cement = item(s, 'Cement', 'Paidar');
  const inv = D.addInvoice(s, { date: '2026-07-03', customerId: c.id, lines: [{ itemId: cement.id, qty: 10, price: 1000 }], freight: 500, labour: 300 });
  assert.equal(inv.subtotal, 10000);
  assert.equal(inv.amount, 10800);
  assert.equal(inv.remainder, 10800 + inv.arrears);
});

test('Purchase: credit leaves the dealer ledger with the purchase but no payment entry', () => {
  const s = fresh();
  const d = dealer(s, 'Sadaat');
  const cement = item(s, 'Cement', 'Paidar');
  const row = D.addPurchase(s, { date: '2026-07-01', dealerId: d.id, itemId: cement.id, qty: 10, price: 1000, payment: 'Credit' });
  assert.equal(row.paidNow, 0);
  assert.equal(s.payments.length, 0, 'no debit entry for credit');
  assert.equal(D.dealerBalance(s, d.id), 10000);
  assert.throws(() => D.addPurchase(s, { dealerId: d.id, itemId: cement.id, qty: 1, price: 10, payment: 'Credit', paidNow: 5 }), /credit/);
});

test('Purchase: editing a purchase recalculates total and its paid-now payment', () => {
  const s = fresh();
  const d = dealer(s, 'Sadaat');
  const cement = item(s, 'Cement', 'Paidar');
  const row = D.addPurchase(s, { date: '2026-07-01', dealerId: d.id, itemId: cement.id, qty: 10, price: 1000, paidNow: 4000 });
  D.updatePurchase(s, row.id, { date: '2026-07-02', dealerId: d.id, itemId: cement.id, qty: 10, price: 1000, freight: 1000, paidNow: 2000 });
  const p = s.purchases.find((x) => x.id === row.id);
  assert.equal(p.total, 11000);
  assert.equal(p.no, row.no, 'purchase number is kept');
  assert.equal(s.payments.length, 1);
  assert.equal(s.payments[0].amount, 2000);
  assert.equal(D.dealerBalance(s, d.id), 9000);
});

test('Bill: editing keeps the number, rewrites the deposit and leaves arrears as before the bill', () => {
  const s = fresh();
  const c = cust(s, 'Hannan Mir');
  const cement = item(s, 'Cement', 'Paidar');
  const first = D.addInvoice(s, { date: '2026-07-01', customerId: c.id, lines: [{ itemId: cement.id, qty: 10, price: 1000 }] });
  const second = D.addInvoice(s, { date: '2026-07-02', customerId: c.id, lines: [{ itemId: cement.id, qty: 5, price: 1000 }], deposit: 1000 });
  assert.equal(second.arrears, 10000);
  D.updateInvoice(s, second.id, { date: '2026-07-02', customerId: c.id, lines: [{ itemId: cement.id, qty: 4, price: 1000 }], deposit: 2000, freight: 200 });
  const e = s.invoices.find((i) => i.id === second.id);
  assert.equal(e.no, second.no);
  assert.equal(e.arrears, 10000, 'arrears are the balance before this bill');
  assert.equal(e.amount, 4200);
  assert.equal(s.payments.filter((p) => p.refId === second.id).length, 1);
  assert.equal(D.customerBalance(s, c.id), 10000 + 4200 - 2000 - 0, 'first bill + edited bill − deposit');
  assert.equal(first.amount, 10000);
});

test('Migration: old purchases with Rent get Freight added to the total', () => {
  const s = fresh();
  s.purchases.push({ id: 'x', no: 1, date: '2026-07-01', dealerId: 'd', itemId: 'i', qty: 10, price: 1000, rent: 500, total: 9500, paidNow: 0 });
  D.migrateState(s);
  const p = s.purchases.at(-1);
  assert.equal(p.freight, 500);
  assert.equal(p.total, 10500);
  assert.equal(p.rent, undefined);
});
