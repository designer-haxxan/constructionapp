// Overview: headline numbers, sales trend, stock mix, bills and balances that need attention.
import * as store from '../store.js';
import { esc, money, moneyShort, qty, dateLong, todayIso, icon, pill, countUp, fillBars, productLook } from '../ui.js';
import { totalsSummary, monthlySales, documentStatus, customerBalance, dealerBalance, stockValuation, invoiceLabel, itemName } from '../domain.js';
import { balanceChip } from './common.js';

let charts = [];
const PALETTE = ['#e09028', '#b86a16', '#60a5fa', '#34d399', '#fb7185', '#c084fc', '#94a3b8', '#fbbf24', '#2dd4bf'];

const kpi = (label, iconName, tone, value, fmt) => `
  <div class="kpi kpi-${tone} reveal">
    <div class="kpi-icon">${icon(iconName)}</div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" data-count="${value}" data-fmt="${fmt}">${fmt === 'money' ? money(0) : 0}</div>
  </div>`;

function crane() {
  return `<svg viewBox="0 0 520 260" class="hero-svg" aria-hidden="true">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2431"/><stop offset="1" stop-color="#0b0f14"/></linearGradient></defs>
    <rect width="520" height="260" fill="url(#sky)"/>
    <g class="hero-blocks">
      <rect class="hb" x="20" y="170" width="80" height="90"/><rect class="hb" x="108" y="130" width="96" height="130"/>
      <rect class="hb" x="212" y="150" width="70" height="110"/><rect class="hb" x="290" y="90" width="110" height="170"/>
      <rect class="hb" x="408" y="140" width="92" height="120"/>
    </g>
    <g class="hero-windows">
      ${[[34, 190], [56, 190], [34, 220], [56, 220], [122, 150], [150, 150], [122, 186], [150, 186], [226, 170], [250, 170], [304, 110], [332, 110], [360, 110], [304, 146], [332, 146], [360, 146], [422, 160], [446, 160], [422, 196], [446, 196]]
        .map(([x, y]) => `<rect class="hw" x="${x}" y="${y}" width="12" height="14"/>`).join('')}
    </g>
    <g class="hero-crane">
      <rect x="250" y="20" width="8" height="150" class="cr"/>
      <rect x="110" y="20" width="148" height="7" class="cr"/>
      <path d="M 120 27 L 250 60" class="cr-brace"/>
      <g class="hero-hook"><line x1="130" y1="27" x2="130" y2="84" class="cable"/><rect x="118" y="84" width="24" height="14" rx="3" class="cr"/></g>
      <rect x="236" y="22" width="36" height="12" rx="2" class="cr"/>
    </g>
    <line x1="0" y1="260" x2="520" y2="260" class="hero-ground"/>
  </svg>`;
}

export default {
  async render(root) {
    const s = store.get();
    const today = todayIso();
    const t = totalsSummary(s, today);
    const monthly = monthlySales(s, 12, today);
    const val = stockValuation(s);
    const status = documentStatus(s);

    const recent = s.invoices.slice().sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no).slice(0, 6);
    const owing = s.customers.map((c) => ({ c, bal: customerBalance(s, c.id) })).filter((x) => x.bal > 0.004).sort((a, b) => b.bal - a.bal).slice(0, 5);
    const dealers = s.dealers.map((d) => ({ d, bal: dealerBalance(s, d.id) })).filter((x) => x.bal > 0.004).sort((a, b) => b.bal - a.bal).slice(0, 5);
    const maxOwing = owing[0]?.bal || 1;
    const maxDeal = dealers[0]?.bal || 1;

    root.innerHTML = `
      <section class="hero reveal">
        <div class="hero-text">
          <div class="eyebrow">${esc(dateLong(today))}</div>
          <h2>${esc(s.business.name)}</h2>
          <p class="hero-tag">${esc(s.business.tagline)}</p>
          <div class="hero-actions">
            <button class="btn btn-accent" data-go="#/bills/new"><i class="bi bi-receipt"></i> New bill</button>
            <button class="btn btn-ghost" data-go="#/purchases/new"><i class="bi bi-bag-plus"></i> Record purchase</button>
            <button class="btn btn-ghost" data-go="#/reports"><i class="bi bi-file-earmark-bar-graph"></i> Reports</button>
          </div>
        </div>
        <div class="hero-art">${crane()}</div>
      </section>

      <section class="kpis">
        ${kpi('Today’s sales', 'calendar-day', 'amber', t.today, 'money')}
        ${kpi('This month', 'graph-up', 'green', t.month, 'money')}
        ${kpi('Customers owe us', 'people', 'red', t.receivables, 'money')}
        ${kpi('We owe dealers', 'truck', 'blue', t.payables, 'money')}
        ${kpi('Stock value', 'boxes', 'violet', t.stockValue, 'money')}
        ${kpi('Items out of stock', 'exclamation-triangle', 'slate', t.outOfStock, 'count')}
      </section>

      <section class="grid-2">
        <div class="card reveal">
          <div class="card-head"><h3>Sales · last 12 months</h3><span class="muted">${esc(money(monthly.reduce((a, m) => a + m.amount, 0)))}</span></div>
          <div class="chart-box"><canvas id="chart-sales" aria-label="Monthly sales"></canvas></div>
        </div>
        <div class="card reveal">
          <div class="card-head"><h3>Stock value by product</h3><span class="muted">${esc(money(val.total))}</span></div>
          <div class="chart-box chart-donut"><canvas id="chart-stock" aria-label="Stock by product"></canvas></div>
        </div>
      </section>

      <section class="grid-3">
        <div class="card reveal">
          <div class="card-head"><h3>Latest bills</h3><a href="#/bills" class="link">All bills</a></div>
          ${recent.length ? `<ul class="list">${recent.map((i) => `<li><a href="#/bills/${esc(i.id)}" class="list-row">
              <div><div class="strong">${esc(invoiceLabel(s, i.no))} · ${esc(i.customerName)}</div><div class="muted small">${esc(dateLong(i.date))}</div></div>
              <div class="right"><div class="strong num">${money(i.amount)}</div>${pill(status.get(i.id)?.status || 'Unpaid')}</div></a></li>`).join('')}</ul>`
            : `<div class="empty-mini">No bills yet. <a href="#/bills/new">Create the first one</a>.</div>`}
        </div>
        <div class="card reveal">
          <div class="card-head"><h3>Customers owing</h3><a href="#/customers" class="link">Ledgers</a></div>
          ${owing.length ? `<ul class="list">${owing.map(({ c, bal }) => `<li><a href="#/customers/${esc(c.id)}" class="list-row stack">
              <div class="row-between"><span class="strong">${esc(c.name)}</span><span class="num">${money(bal)}</span></div>
              <div class="bar"><span data-fill="${Math.round((bal / maxOwing) * 100)}"></span></div></a></li>`).join('')}</ul>`
            : `<div class="empty-mini">Nobody owes money right now.</div>`}
        </div>
        <div class="card reveal">
          <div class="card-head"><h3>Dealers to pay</h3><a href="#/dealers" class="link">Ledgers</a></div>
          ${dealers.length ? `<ul class="list">${dealers.map(({ d, bal }) => `<li><a href="#/dealers/${esc(d.id)}" class="list-row stack">
              <div class="row-between"><span class="strong">${esc(d.name)}</span><span class="num">${money(bal)}</span></div>
              <div class="bar bar-warn"><span data-fill="${Math.round((bal / maxDeal) * 100)}"></span></div></a></li>`).join('')}</ul>`
            : `<div class="empty-mini">No dealer balances outstanding.</div>`}
        </div>
      </section>`;

    root.querySelectorAll('[data-count]').forEach((el) => {
      const v = Number(el.dataset.count);
      countUp(el, v, el.dataset.fmt === 'money' ? money : (n) => Math.round(n).toLocaleString('en-US'));
    });
    fillBars(root);
    drawCharts(root, monthly, val);
  },
};

function drawCharts(root, monthly, val) {
  charts.forEach((c) => c.destroy());
  charts = [];
  if (!globalThis.Chart) return;
  const Chart = globalThis.Chart;
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = 'Barlow, system-ui, sans-serif';
  const sales = root.querySelector('#chart-sales');
  if (sales) {
    const ctx = sales.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, '#e09028');
    grad.addColorStop(1, 'rgba(251,133,0,0.15)');
    charts.push(new Chart(sales, {
      type: 'bar',
      data: {
        labels: monthly.map((m) => new Date(`${m.key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })),
        datasets: [{ data: monthly.map((m) => m.amount), backgroundColor: grad, borderRadius: 8, borderSkipped: false, maxBarThickness: 36 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.y) } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { callback: (v) => moneyShort(v) } },
        },
      },
    }));
  }
  const byProduct = new Map();
  for (const r of val.rows) byProduct.set(r.product, (byProduct.get(r.product) || 0) + r.value);
  const stock = root.querySelector('#chart-stock');
  if (stock) {
    const entries = [...byProduct].filter(([, v]) => v > 0);
    charts.push(new Chart(stock, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => k),
        datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: '#0f1620', borderWidth: 3 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        animation: { animateRotate: true, duration: 1100 },
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${money(c.parsed)}` } } },
      },
    }));
  }
}
