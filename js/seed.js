// First-run data taken from "Data Entry Form Shakeel Sons.xlsm": products and units (Form), price index (Price Index),
// dealers and the products they supply (Form, "Dealer" row), customers (Customer Profiles) and the bill number to continue from
// (Bill sheet showed 4738). Spellings follow the Form where sheets disagree ("Doum", "Tawi", "Patoki 64").
import { itemId } from './domain.js';

export const PRODUCTS = [
  { name: 'Cement', unit: 'Bags' },
  { name: 'Steel', unit: 'Kgs' },
  { name: 'Brick', unit: 'Bricks' },
  { name: 'Sand', unit: 'Feet' },
  { name: 'Aggregate', unit: 'Feet' },
  { name: 'Tile Bond', unit: 'Bags' },
  { name: 'Tile Filler', unit: 'Bags' },
  { name: 'Ring', unit: 'Kgs' },
  { name: 'Steel Wire', unit: 'Spools' },
];

const CEMENT = { Paidar: 1550, Lucky: 1520, Flying: 1530, Pioneer: 1520, Askari: 1600, MapleLeaf: 1570, 'MapleLeaf White': 2200, BestWay: 1500, PakCem: 1540 };
const STEEL_GRADES = ['60 Guage', '40 Guage', '0 Guage'];
const STEEL = {
  'Islamabad Steel': [245, 240, 235], Malik: [265, 255, 240], 'Mughal Steel': [295, 255, 240], GM: [250, 240, 230],
  Chaudhary: [265, 255, 240], Mehboob: [275, 265, 255], Scrap: [140, 140, 140],
};
const BRICK_BRANDS = ['KB', 'AB', 'AS', 'S', 'SS', 'Patoki 64', '1000', '666'];
const BRICK_QUALITIES = { Awal: 18, Doum: 16, Soum: 15, Rora: 13, Saar: 10 };
const SAND = { Tawi: 70, Damper: 65, M: 65 };
const AGGREGATE = { Bajar: 150, Bajri: 230, 'Fine Bajri': 260, 'Texila Bajri': 245, 'Sargodha Bajri': 260, 'Barnala Bajri': 220, 'Chips Bajri': 250 };
const TILE_BOND = { Master: 550, 'Hi-Tec': 600, ABC: 450 };
const TILE_FILLER = { Master: 160, 'Hi-Tec': null };
const RING_SIZES = ['3x3', '4x4', '4x6', '6x6', '6x9', '9x9', '12x9', '12x12'];

const PRICE_ROWS = [
  ...Object.entries(CEMENT).map(([b, p]) => ['Cement', b, '', p]),
  ...Object.entries(STEEL).flatMap(([b, prices]) => STEEL_GRADES.map((g, i) => ['Steel', b, g, prices[i]])),
  ...BRICK_BRANDS.flatMap((b) => Object.entries(BRICK_QUALITIES).map(([q, p]) => ['Brick', b, q, p])),
  ...Object.entries(SAND).map(([q, p]) => ['Sand', '', q, p]),
  ...Object.entries(AGGREGATE).map(([q, p]) => ['Aggregate', '', q, p]),
  ...Object.entries(TILE_BOND).map(([b, p]) => ['Tile Bond', b, '', p]),
  ...Object.entries(TILE_FILLER).map(([b, p]) => ['Tile Filler', b, '', p]),
  ...RING_SIZES.map((s) => ['Ring', '', s, 250]),
  ['Steel Wire', '', '', 300],
];

const DEALERS = [
  { name: 'Sadaat', productNames: ['Cement'] },
  { name: 'Shahid', productNames: ['Cement'] },
  { name: 'Qaiser', productNames: ['Steel'] },
  { name: 'Samar', productNames: ['Steel'] },
  { name: 'Ali Akbar', productNames: ['Brick'] },
  { name: 'Outsource', productNames: ['Sand', 'Aggregate'] },
  { name: 'HCS', productNames: ['Tile Bond', 'Tile Filler'] },
];

const CUSTOMERS = [
  ['Sharikh Naveed', '0335 7426667', '227 H.Bilal St, Allied Villas, Khichan', 'Sialkot, 51310, Punjab, PK'],
  ['Saad Shakeel', '0322 1245783', 'Cantt View Colony, Phase 3', 'Sialkot, 51310, Punjab, PK'],
  ['Shamir Naveed', '0335 7324689', '227 H.Bilal St, Allied Villas, Khichan', 'Sialkot, 51310, Punjab, PK'],
  ['Rizwan Abid', '0335 7426667', 'Bait-Ul-Shehryar, Pakkah Garrah', 'Sialkot, 51310, Punjab, PK'],
  ['Aneeq Kashif', '0335 7426667', 'H#94, Badar Rd, DOHS', 'Sialkot, 51310, Punjab, PK'],
  ['Hannan Mir', '0335 7426667', 'Wajidpurah, Drumanwala Chowk', 'Sialkot, 51310, Punjab, PK'],
  ['Adam Muneeb', '0335 7426667', 'Apt. 32B, DHA Rahbar', 'Lahore, 05450, Punjab, PK'],
  ['Ali Hamza', '0334 8894545', '123 Main St, Blvd Dr, Orange', 'New Jersey, 54166, USA'],
  ['Fahad Shakeel', '0322 2546464', 'H#23, Phase 2, Cantt View Colony', 'Sialkot, 51310, Punjab, PK'],
  ['Shakeel Anwar', '0322 5554477', 'Wajidpurah, Drumanwala Chowk', 'Sialkot, 51310, Punjab, PK'],
  ['Salman Arshad', '0322 5554477', 'Wajidpurah, Drumanwala Chowk', 'Sialkot, 51310, Punjab, PK'],
  ['Jawad Hashmi', '0348 6545544', '19/2, Zafar Ali Rd, Cantonment', 'Sialkot, 51310, Punjab, PK'],
  ['Rafaqat Khan', '0336 7412588', '12B, Hamzah Ghous, Pull Aik', 'Sialkot, 51310, Punjab, PK'],
];

export function seedState(now = new Date().toISOString()) {
  const unitOf = Object.fromEntries(PRODUCTS.map((p) => [p.name, p.unit]));
  const items = PRICE_ROWS.map(([product, brand, quality, price]) => ({
    id: itemId(product, brand, quality), product, brand, quality, unit: unitOf[product], price: price ?? null,
  }));
  return {
    version: 1,
    business: {
      name: 'Shakeel Sons',
      tagline: 'Cement · Steel · Bricks · Sand · Aggregate · Tiles',
      address: 'Shakeel Sons, Gondal Rd, Gujjar Town',
      city: 'Sialkot, 51310, Punjab, PK',
      phone: '0335 3819000',
    },
    invoice: { prefix: 'S', next: 4739 },
    purchaseNo: { next: 1 },
    products: PRODUCTS.map((p) => ({ ...p })),
    items,
    customers: CUSTOMERS.map(([name, contact, address, city]) => ({
      id: crypto.randomUUID(), name, contact, address, city, opening: 0, openingDate: null, createdAt: now,
    })),
    dealers: DEALERS.map((d) => ({
      id: crypto.randomUUID(), name: d.name, contact: '', address: '', city: '', opening: 0, openingDate: null,
      productNames: d.productNames, createdAt: now,
    })),
    purchases: [],
    invoices: [],
    payments: [],
    adjustments: [],
  };
}
