// Reports: sales, purchases, receivables ageing, dealer payables and stock valuation. Each can be printed or exported as CSV.
import * as store from '../store.js';
import { esc, money, moneyShort, qty, dateLong, todayIso, icon, pill, printHtml, downloadFile, csv } from '../ui.js';
import { salesReport, purchaseReport, agingReport, stockValuation, dealerBalance, invoiceLabel, purchaseLabel, itemName, documentStatus } from '../domain.js';
import { reportDoc } from './common.js';

const TABS = [
  ['sales', 'Sales', 'receipt'],
  ['purchases', 'Purchases', 'bag-check'],
  ['receivables', 'Receivables ageing', 'hourglass-split'],
  ['payables', 'Dealer payables', 'truck'],
  ['stock', 'Stock valuation', 'boxes'],
];
let charts = [];
const PALETTE = ['#e09028', '#b86a16', '#60a5fa', '#34d399', '#fb7185', '#c084fc', '#94a3b8', '#fbbf24', '#2dd4bf'];

function monthStart(d) { return `${d.slice(0, 7)}-01`; }
function presets(today) {
  const y = today.slice(0, 4);
  const shift = (n) => { const d = new Date(`${today}T00:00:00`); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
  return {
    month: [monthStart(today), today],
    quarter: [shift(2).slice(0, 7) + '-01', today],
    year: [`${y}-01-01`, today],
    all: ['', ''],
  };
}

export default {
  async render(root, ctx) {
    const tab = TABS.some((t) => t[0] === ctx.params[0]) ? ctx.params[0] : 'sales';
    const today = todayIso();
    const range = { from: monthStart(today), to: today };
    const needsRange = tab === 'sales' || tab === 'purchases';
    const outputButtons = `<div class="page-actions"><button class="btn btn-ghost" data-print type="button"><i class="bi bi-printer"></i> Print</button><button class="btn btn-ghost" data-csv type="button"><i class="bi bi-filetype-csv"></i> CSV</button></div>`;
    const rangeFields = `<label class="field compact"><span>From</span><input type="date" data-from value="${range.from}"></label>
        <label class="field compact"><span>To</span><input type="date" data-to value="${range.to}"></label>
        <div class="chip-row">${[['month', 'This month'], ['quarter', 'Last 3 months'], ['year', 'This year'], ['all', 'All time']]
          .map(([k, l]) => `<button class="chip" data-preset="${k}" type="button">${l}</button>`).join('')}</div>`;
    root.innerHTML = `
      <nav class="tabs report-tabs" role="tablist">
        ${TABS.map(([id, label, ic]) => `<a class="tab ${id === tab ? 'active' : ''}" href="#/reports/${id}" role="tab">${icon(ic)} ${esc(label)}</a>`).join('')}
      </nav>
      <div data-range class="range-bar">${needsRange ? rangeFields : ''}${outputButtons}</div>
      <div data-report class="report-body"></div>`;
    const body = root.querySelector('[data-report]');

    const draw = () => {
      const s = store.get();
      const from = root.querySelector('[data-from]')?.value || '';
      const to = root.querySelector('[data-to]')?.value || '';
      const period = from || to ? `${from ? dateLong(from) : 'start'} – ${to ? dateLong(to) : 'today'}` : 'All time';
      let out;
      if (tab === 'sales') out = sales(s, from, to, period);
      else if (tab === 'purchases') out = purchases(s, from, to, period);
      else if (tab === 'receivables') out = receivables(s, today);
      else if (tab === 'payables') out = payables(s, today);
      else out = stock(s, today);
      body.innerHTML = out.html;
      out.chart?.(body);
      root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
        const [f, t] = presets(today)[b.dataset.preset];
        root.querySelector('[data-from]').value = f;
        root.querySelector('[data-to]').value = t;
        draw();
      }));
      root.querySelector('[data-print]').onclick = () => printHtml(reportDoc(s.business, out.title, period, out.html));
      root.querySelector('[data-csv]').onclick = () => {
        downloadFile(`${out.file}-${today}.csv`, csv(out.csv), 'text/csv');
      };
    };
    root.querySelector('[data-from]')?.addEventListener('change', draw);
    root.querySelector('[data-to]')?.addEventListener('change', draw);
    draw();
  },
};

function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
function makeChart(el, config) {
  if (!el || !globalThis.Chart) return;
  charts.push(new globalThis.Chart(el, config));
}

function kpis(items) {
  return `<section class="stats-row">${items.map(([l, v, tone]) => `<div class="stat reveal ${tone || ''}"><span>${esc(l)}</span><strong class="num">${v}</strong></div>`).join('')}</section>`;
}

function sales(s, from, to, period) {
  const r = salesReport(s, from, to);
  const prod = r.byProduct;
  const share = (amt) => (r.total ? `${((amt / r.total) * 100).toFixed(1)}%` : '0%');
  const html = `
    ${kpis([['Billed', money(r.total), 'accent'], ['Bills', String(r.count)], ['Average bill', money(r.average)], ['Collected in period', money(r.collected), 'ok'], ['Still outstanding', money(r.outstanding), 'bad']])}
    <div class="grid-2">
      <div class="card reveal"><div class="card-head"><h3>Billing by month</h3></div><div class="chart-box"><canvas data-chart></canvas></div></div>
      <div class="card reveal"><div class="card-head"><h3>Share by product</h3></div><div class="chart-box chart-donut"><canvas data-chart2></canvas></div></div>
    </div>
    <div class="grid-2">
      <div class="card table-card reveal"><div class="card-head"><h3>By product</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
          <tbody>${prod.map((p) => `<tr><td class="strong">${esc(p.product)}</td><td class="num">${qty(p.qty)} ${esc(p.unit)}</td><td class="num">${money(p.amount)}</td><td class="num">${share(p.amount)}</td></tr>`).join('') || '<tr><td colspan="4">No sales in this period</td></tr>'}</tbody></table></div></div>
      <div class="card table-card reveal"><div class="card-head"><h3>By customer</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th class="num">Bills</th><th class="num">Amount</th></tr></thead>
          <tbody>${r.byCustomer.map((c) => `<tr><td><a href="#/customers/${esc(c.customerId)}">${esc(c.name)}</a></td><td class="num">${c.count}</td><td class="num">${money(c.amount)}</td></tr>`).join('') || '<tr><td colspan="3">No sales in this period</td></tr>'}</tbody></table></div></div>
    </div>
    <div class="card table-card reveal"><div class="card-head"><h3>Bills · ${esc(period)}</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Bill</th><th>Date</th><th>Customer</th><th class="num">Amount</th><th class="num">Arrears</th><th class="num">Deposit</th><th class="num">Remainder</th><th>Status</th></tr></thead>
        <tbody>${r.invoices.map((i) => `<tr><td><a href="#/bills/${esc(i.id)}">${esc(invoiceLabel(s, i.no))}</a></td><td>${esc(dateLong(i.date))}</td><td>${esc(i.customerName)}</td>
          <td class="num">${money(i.amount)}</td><td class="num">${money(i.arrears)}</td><td class="num">${money(i.deposit)}</td><td class="num">${money(i.remainder)}</td><td>${pill(r.status.get(i.id)?.status || 'Unpaid')}</td></tr>`).join('') || '<tr><td colspan="8">No bills in this period</td></tr>'}</tbody></table></div></div>`;
  const csvRows = [['Bill', 'Date', 'Customer', 'Amount', 'Arrears', 'Deposit', 'Remainder', 'Status']];
  r.invoices.forEach((i) => csvRows.push([invoiceLabel(s, i.no), i.date, i.customerName, i.amount, i.arrears, i.deposit, i.remainder, r.status.get(i.id)?.status || '']));
  return {
    title: 'Sales report', file: 'sales-report', html, csv: csvRows,
    chart(root) {
      destroyCharts();
      const Chart = globalThis.Chart; if (!Chart) return;
      Chart.defaults.color = '#94a3b8';
      makeChart(root.querySelector('[data-chart]'), { type: 'bar', data: { labels: r.byMonth.map((m) => new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })), datasets: [{ data: r.byMonth.map((m) => m.amount), backgroundColor: '#e09028', borderRadius: 8, maxBarThickness: 40 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 800 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.y) } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { callback: (v) => moneyShort(v) } } } } });
      makeChart(root.querySelector('[data-chart2]'), { type: 'doughnut', data: { labels: prod.map((p) => p.product), datasets: [{ data: prod.map((p) => p.amount), backgroundColor: prod.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: '#0f1620', borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' } } } });
    },
  };
}

function purchases(s, from, to, period) {
  const r = purchaseReport(s, from, to);
  const status = documentStatus(s);
  const onCredit = r.purchases.filter((p) => p.payment === 'Credit').reduce((a, p) => a + p.total, 0);
  const html = `
    ${kpis([['Purchased', money(r.total), 'accent'], ['Entries', String(r.count)], ['Paid out in period', money(r.paid), 'ok'], ['On credit', money(onCredit), 'bad']])}
    <div class="grid-2">
      <div class="card reveal"><div class="card-head"><h3>Share by dealer</h3></div><div class="chart-box chart-donut"><canvas data-chart></canvas></div></div>
      <div class="card table-card reveal"><div class="card-head"><h3>By dealer</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Dealer</th><th class="num">Entries</th><th class="num">Amount</th></tr></thead>
          <tbody>${r.byDealer.map((d) => `<tr><td><a href="#/dealers/${esc(d.dealerId)}">${esc(d.name)}</a></td><td class="num">${d.count}</td><td class="num">${money(d.amount)}</td></tr>`).join('') || '<tr><td colspan="3">No purchases in this period</td></tr>'}</tbody></table></div></div>
      <div class="card table-card reveal"><div class="card-head"><h3>By product</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
          <tbody>${r.byProduct.map((p) => `<tr><td class="strong">${esc(p.product)}</td><td class="num">${qty(p.qty)} ${esc(p.unit)}</td><td class="num">${money(p.amount)}</td></tr>`).join('') || '<tr><td colspan="3">No purchases in this period</td></tr>'}</tbody></table></div></div>
    </div>
    <div class="card table-card reveal"><div class="card-head"><h3>Purchase invoices · ${esc(period)}</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Date</th><th>Dealer</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Freight</th><th class="num">Total</th><th>Payment</th><th>Status</th></tr></thead>
        <tbody>${r.purchases.map((p) => `<tr><td><a href="#/purchases/${esc(p.id)}">${purchaseLabel(p.no)}</a></td><td>${esc(dateLong(p.date))}</td><td>${esc(p.dealerName)}</td><td>${esc(itemName(p))}</td>
          <td class="num">${qty(p.qty)} ${esc(p.unit)}</td><td class="num">${money(p.price)}</td><td class="num">${money(p.freight || 0)}</td><td class="num">${money(p.total)}</td><td>${esc(p.payment)}</td><td>${pill(status.get(p.id)?.status || 'Unpaid')}</td></tr>`).join('') || '<tr><td colspan="10">No purchases in this period</td></tr>'}</tbody></table></div></div>`;
  const rows = [['Invoice', 'Date', 'Dealer', 'Item', 'Qty', 'Unit', 'Price', 'Freight', 'Total', 'Paid now', 'Payment', 'Status']];
  r.purchases.forEach((p) => rows.push([purchaseLabel(p.no), p.date, p.dealerName, itemName(p), p.qty, p.unit, p.price, p.freight || 0, p.total, p.paidNow, p.payment, status.get(p.id)?.status || 'Unpaid']));
  return {
    title: 'Purchase invoice report', file: 'purchase-invoice-report', html, csv: rows,
    chart(root) {
      destroyCharts();
      const d = r.byDealer;
      makeChart(root.querySelector('[data-chart]'), { type: 'doughnut', data: { labels: d.map((x) => x.name), datasets: [{ data: d.map((x) => x.amount), backgroundColor: d.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: '#0f1620', borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' } } } });
    },
  };
}

function receivables(s, today) {
  const r = agingReport(s, today);
  const t = r.totals;
  const html = `
    ${kpis([['Total receivable', money(t.total), 'bad'], ['0–30 days', money(t.d0)], ['31–60 days', money(t.d31), 'warn'], ['61–90 days', money(t.d61), 'warn'], ['Over 90 days', money(t.d90), 'bad']])}
    <div class="card table-card reveal"><div class="card-head"><h3>Who owes what, by age · as of ${esc(dateLong(today))}</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th class="num">0–30</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">90+</th><th class="num">Total</th></tr></thead>
        <tbody>${r.rows.map((x) => `<tr><td><a href="#/customers/${esc(x.customerId)}">${esc(x.name)}</a></td><td class="num">${money(x.d0)}</td><td class="num">${money(x.d31)}</td><td class="num">${money(x.d61)}</td><td class="num">${money(x.d90)}</td><td class="num strong">${money(x.total)}</td></tr>`).join('') || '<tr><td colspan="6">Nothing is owed right now.</td></tr>'}</tbody>
        ${r.rows.length ? `<tfoot><tr><th>Total</th><th class="num">${money(t.d0)}</th><th class="num">${money(t.d31)}</th><th class="num">${money(t.d61)}</th><th class="num">${money(t.d90)}</th><th class="num">${money(t.total)}</th></tr></tfoot>` : ''}</table></div></div>`;
  const rows = [['Customer', '0-30', '31-60', '61-90', '90+', 'Total']];
  r.rows.forEach((x) => rows.push([x.name, x.d0, x.d31, x.d61, x.d90, x.total]));
  return { title: 'Receivables ageing', file: 'receivables', html, csv: rows, chart: destroyCharts };
}

function payables(s, today) {
  const list = s.dealers.map((d) => ({ d, bal: dealerBalance(s, d.id) }))
    .map((x) => ({ ...x, last: s.purchases.filter((p) => p.dealerId === x.d.id).map((p) => p.date).sort().at(-1) || '' }))
    .sort((a, b) => b.bal - a.bal);
  const total = list.reduce((a, x) => a + Math.max(0, x.bal), 0);
  const html = `
    ${kpis([['Total we owe dealers', money(total), 'warn'], ['Dealers', String(s.dealers.length)], ['With balance', String(list.filter((x) => x.bal > 0.004).length)]])}
    <div class="card table-card reveal"><div class="card-head"><h3>Dealer balances · as of ${esc(dateLong(today))}</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Dealer</th><th>Supplies</th><th>Last purchase</th><th class="num">We owe</th><th></th></tr></thead>
        <tbody>${list.map((x) => `<tr><td><a href="#/dealers/${esc(x.d.id)}">${esc(x.d.name)}</a></td><td>${esc((x.d.productNames || []).join(', ') || '—')}</td><td>${x.last ? esc(dateLong(x.last)) : '—'}</td>
          <td class="num strong">${money(x.bal)}</td><td>${x.bal > 0.004 ? pill('Unpaid') : pill('Paid')}</td></tr>`).join('')}</tbody></table></div></div>`;
  const rows = [['Dealer', 'Supplies', 'Last purchase', 'We owe']];
  list.forEach((x) => rows.push([x.d.name, (x.d.productNames || []).join(' / '), x.last, x.bal]));
  return { title: 'Dealer payables', file: 'payables', html, csv: rows, chart: destroyCharts };
}

function stock(s, today) {
  const v = stockValuation(s);
  const html = `
    ${kpis([['Stock value', money(v.total), 'accent'], ['Items', String(v.rows.length)], ['Out of stock', String(v.rows.filter((r) => r.qty <= 0).length), 'bad']])}
    <div class="card table-card reveal"><div class="card-head"><h3>Valuation at price index · ${esc(dateLong(today))}</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Brand</th><th>Quality</th><th class="num">On hand</th><th class="num">Rate</th><th class="num">Value</th></tr></thead>
        <tbody>${v.rows.map((r) => `<tr class="${r.qty <= 0 ? 'row-bad' : ''}"><td>${esc(r.product)}</td><td>${esc(r.brand || '—')}</td><td>${esc(r.quality || '—')}</td>
          <td class="num">${qty(r.qty)} ${esc(r.unit)}</td><td class="num">${r.price === null ? '—' : money(r.price)}</td><td class="num">${money(r.value)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="5">Total</th><th class="num">${money(v.total)}</th></tr></tfoot></table></div></div>`;
  const rows = [['Product', 'Brand', 'Quality', 'On hand', 'Unit', 'Rate', 'Value']];
  v.rows.forEach((r) => rows.push([r.product, r.brand, r.quality, r.qty, r.unit, r.price ?? '', r.value]));
  return { title: 'Stock valuation', file: 'stock-valuation', html, csv: rows, chart: destroyCharts };
}

export { invoiceLabel };
