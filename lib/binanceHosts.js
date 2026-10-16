// binanceHosts.js
// ---------------------------------------------------------------------------
// Resilient Binance host failover.
//
// WHY: Binance blocks a lot of cloud / datacenter IP ranges and some regions
// with HTTP 451 ("Unavailable For Legal Reasons") or 403. That is exactly what
// happens the moment you move the server from a laptop to a cloud host.
//
// FIX: `data-api.binance.vision` is Binance's PUBLIC market-data domain. It
// serves the very same `/api/v3/*` endpoints (ticker / klines / depth /
// exchangeInfo), needs NO API key, and is NOT geo/datacenter blocked. So we try
// it FIRST, then fall back to the normal API hosts if needed.
//
// Override anytime with env:  BINANCE_HOSTS="https://h1,https://h2"
//                      (or)   BINANCE_HOST="https://single-host"
// ---------------------------------------------------------------------------

const DEFAULT_HOSTS = [
  'https://data-api.binance.vision', // public market data — works on cloud IPs
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

const ENV_HOSTS = (process.env.BINANCE_HOSTS || process.env.BINANCE_HOST || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const BINANCE_HOSTS = ENV_HOSTS.length ? ENV_HOSTS : DEFAULT_HOSTS;

// Index of the last host that worked, so we try it first next time instead of
// re-walking blocked hosts on every single request.
let _preferred = 0;

async function fetchOne(host, path, qs, timeoutMs) {
  const url = host + path + (qs ? '?' + qs : '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'apex-price-server/1.0', Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Fetch a Binance public endpoint, walking the host list (preferred first)
// until one answers OK. `qs` is a query string WITHOUT the leading '?'.
// Returns parsed JSON, or throws if every host failed.
export async function binanceFetch(path, qs = '', { timeoutMs = 8000 } = {}) {
  const n = BINANCE_HOSTS.length;
  let lastErr = null;
  for (let i = 0; i < n; i++) {
    const idx = (_preferred + i) % n;
    const host = BINANCE_HOSTS[idx];
    try {
      const res = await fetchOne(host, path, qs, timeoutMs);
      if (!res.ok) {
        // 451/403 = blocked here, 418/429 = rate-limited here -> try next host.
        lastErr = new Error(`Binance ${host} responded ${res.status}`);
        continue;
      }
      _preferred = idx; // remember the winner for next time
      return await res.json();
    } catch (e) {
      lastErr = e; // network error / timeout / abort -> try next host
    }
  }
  throw lastErr || new Error('all Binance hosts failed');
}

// Which host is currently preferred (handy for /health or logging).
export function currentBinanceHost() {
  return BINANCE_HOSTS[_preferred] || BINANCE_HOSTS[0];
}
