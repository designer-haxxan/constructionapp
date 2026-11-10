// Local storage of the ledger. One JSON document in IndexedDB (falls back to localStorage if IndexedDB is unavailable).
// Every change goes through mutate(), which works on a copy and only replaces the saved state when the change succeeds.
import { seedState } from './seed.js';

const DB_NAME = 'materials_ledger';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'materials_ledger.state';

let state = null;
let backend = 'indexeddb';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRaw() {
  if (backend === 'indexeddb') {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const r = db.transaction(STORE).objectStore(STORE).get(KEY);
        r.onsuccess = () => resolve(r.result ?? null);
        r.onerror = () => reject(r.error);
      });
    } catch { backend = 'localstorage'; }
  }
  const raw = localStorage.getItem(LS_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function writeRaw(value) {
  if (backend === 'indexeddb') {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return;
    } catch { backend = 'localstorage'; }
  }
  localStorage.setItem(LS_KEY, JSON.stringify(value));
}

export async function init() {
  const saved = await readRaw();
  state = saved && saved.version === 1 ? saved : seedState();
  if (!saved) await writeRaw(state);
  return state;
}

export const get = () => state;

// Runs fn on a copy of the state. If fn throws, nothing changes. Returns fn's result.
export async function mutate(fn) {
  const draft = structuredClone(state);
  const result = fn(draft);
  await writeRaw(draft);
  state = draft;
  return result;
}

export async function replaceAll(next) {
  const valid = next && next.version === 1 && Array.isArray(next.customers) && Array.isArray(next.dealers)
    && Array.isArray(next.items) && Array.isArray(next.invoices) && Array.isArray(next.purchases) && Array.isArray(next.payments);
  if (!valid) throw new Error('This file is not a ledger backup.');
  await writeRaw(next);
  state = next;
}

export async function resetToSeed() {
  const fresh = seedState();
  await writeRaw(fresh);
  state = fresh;
}

export const storageBackend = () => backend;
