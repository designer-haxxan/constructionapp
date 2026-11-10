# Materials Ledger

A ledger app for a building-materials business (cement, steel, bricks, sand, aggregate, tiles, rings and wire), built from the
"Data Entry Form Shakeel Sons" workbook.

- **Purchases** from dealers, as on the workbook's *Form* sheet: Qty × Price − Rent, with payment method and "paid now".
- **Sales bills** to customers, as on the *Bill* sheet: amount, arrears from the ledger, deposit, remainder, print.
- **Customer ledgers** and **dealer ledgers**: a running balance per party, payments that settle the oldest items first,
  statements (print and CSV).
- **Stock** on hand by product, brand and quality, valued at the **price index**; stock movements and adjustments.
- **Reports**: sales, purchases, receivables ageing, dealer payables and stock valuation, each with a date range, charts, print and CSV.
- **Sign-in** through the eposwala login API (the same account system as before).

No build step: plain HTML, CSS and ES modules. GSAP and Chart.js load from jsDelivr; Bootstrap Icons and the fonts load from their CDNs.

## Run it

```bash
npm test          # domain rules (ledgers, stock, reports) with node's built-in test runner
npm run serve     # then open http://127.0.0.1:8080
```

Sign-in needs the internet and the eposwala API, which only accepts requests from `https://eposwala.com`.
Once signed in, the ledger works offline.

## Where things live

| Path | What it is |
|---|---|
| `js/domain.js` | All business rules: totals, settlement, ledgers, stock, reports. Pure functions, unit-tested. |
| `js/seed.js` | Starting data taken from the workbook (products, price index, dealers, customers, bill number 4739). |
| `js/store.js` | Saves the ledger as one document in IndexedDB. Every change is applied to a copy first. |
| `js/auth.js` | Sign-in against the eposwala API. |
| `js/main.js` | Sign-in screen, navigation, routing, boot. |
| `js/views/*.js` | One file per screen. |
| `css/styles.css` | Theme, animations, responsive layout, print styles. |
| `tests/domain.test.mjs` | Tests for the rules above. |

## Rules that come from the workbook

- **Purchase total** = Quantity × Price − Rent (Form, cell D24). Rent is deducted, as the sheet does.
- **Bill remainder** = Amount + Arrears − Deposit (Bill, cell F28). Arrears now come from the customer's ledger.
- **Entry types** on a purchase: *Purchasing* adds stock and owes the dealer; *Trading* is recorded on the ledger only;
  *Selling* takes stock out.
- **Settlement**: a payment clears the oldest open item first (opening balance, then bills or purchases by date).
  A bill's status (Paid / Partly paid / Unpaid) follows from that.
- **Deleting** a bill or purchase also removes the deposit or paid-now payment that came with it. A customer or dealer
  with bills or purchases cannot be deleted, so the ledger stays complete.

## Data and backups

Everything is stored on the device. Download a backup from *Settings* regularly. Restoring a backup replaces the data on the device.
The sign-in device id is kept under the same key as the previous app, so a phone that was already bound keeps its binding.

## Deployment

`CNAME` and `.nojekyll` are unchanged. `CNAME` points at `pos.eposwala.com`, so publishing this repository to GitHub Pages
would replace that site. Change `CNAME` first if you want a different address.
