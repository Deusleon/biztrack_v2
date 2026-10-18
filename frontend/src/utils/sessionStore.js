// Each tab keeps its own sign-in. Signing out here does not clear another tab or another device.
const KEYS = ['accessToken', 'user', 'cachedPermissions', 'currentStoreId', 'currentStoreName'];

function readRaw(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeRaw(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch { /* private mode */ }
}

// A tab that still has the old shared sign-in takes a copy, then the shared copy is removed
// so the next tab does not inherit the same account.
if (typeof window !== 'undefined' && !readRaw('accessToken')) {
  const shared = localStorage.getItem('accessToken');
  if (shared) {
    KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value != null) writeRaw(key, value);
      localStorage.removeItem(key);
    });
  }
}

export function readSession(key) {
  return readRaw(key);
}

export function writeSession(key, value) {
  writeRaw(key, value);
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const NOTICE_KEY = 'loginNotice';

export function setLoginNotice(code) {
  writeRaw(NOTICE_KEY, code);
}

export function takeLoginNotice() {
  const value = readRaw(NOTICE_KEY);
  writeRaw(NOTICE_KEY, null);
  return value;
}

export function clearAuthSession() {
  KEYS.forEach((key) => {
    writeRaw(key, null);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
}
