// Sign-in against the eposwala login API: POST {API}/login with { username, password, deviceId }.
// The server binds an account to one device. The device id is kept under the same key the previous app used,
// so a phone that was already bound keeps its binding.
const API = 'https://eposwala.com/api';
const SESSION_KEY = 'materials_ledger.session';
const DEVICE_KEY = 'minipos.deviceId';

const ERRORS = {
  missing_fields: 'Enter your username and password.',
  invalid_credentials: 'Wrong username or password.',
  device_mismatch: 'This account is already active on another phone. Call the support number to move it.',
  account_disabled: 'This account has been disabled. Call the support number for help.',
};
const GENERIC = 'Sign-in failed. Try again.';

export function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

const valid = (s) => !!(s && typeof s.token === 'string' && s.token && typeof s.username === 'string' && Number(s.expiresAt) > Date.now());

export function currentSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (valid(s)) return s;
  } catch { /* unreadable session */ }
  localStorage.removeItem(SESSION_KEY);
  return null;
}

export async function signIn(username, password) {
  username = String(username ?? '').trim();
  password = String(password ?? '');
  if (!username || !password) throw new Error(ERRORS.missing_fields);
  if (!navigator.onLine) throw new Error('Internet is needed to sign in. Your ledger still works offline once you are signed in.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, deviceId: deviceId() }),
      credentials: 'omit', cache: 'no-store', signal: ctrl.signal,
    });
  } catch {
    throw new Error('Could not reach the sign-in server. Check the connection and try again.');
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(ERRORS[data?.error] || GENERIC);
  const session = { token: data?.token, expiresAt: Number(data?.expiresAt), username: data?.username || username };
  if (!valid(session)) throw new Error(GENERIC);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}
