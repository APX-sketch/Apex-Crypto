// binanceProxy.js
// Generic server-side proxy/cache for Binance PUBLIC REST endpoints
// (depth / klines / ticker / exchangeInfo).
//
// Why this exists: the trading page needs order book, candles and ticker.
// If every user's browser called Binance directly, heavy traffic would get
// the platform rate-limit banned. Instead, ALL users read from THIS server.
//
// Two anti-ban mechanisms:
//   1. TTL cache  -> within a short window we reuse the last response.
//   2. In-flight coalescing -> if 500 users ask for the same thing at once,
//      we make ONE upstream request and share the result. No thundering herd.
// On upstream failure we serve the last good (stale) value if we have one.

import { binanceFetch } from './binanceHosts.js';

export class BinanceProxy {
  constructor() {
    this.cache = new Map();     // key -> { at, data }
    this.inflight = new Map();  // key -> Promise
  }

  // Kick off (or join) a single upstream refresh for this key. Concurrent
  // callers share ONE request (coalescing) — no thundering herd on Binance.
  _refresh(key, path, qs) {
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      // binanceFetch walks data-api.binance.vision -> api.binance.com -> ...
      // -> OKX -> Bybit, so a block on one source transparently fails over.
      const data = await binanceFetch(path, qs);
      this.cache.set(key, { at: Date.now(), data });
      return data;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  // Smart cache with stale-while-revalidate:
  //   1) age < ttl        -> serve fresh instantly.
  //   2) ttl <= age < max  -> serve the cached value INSTANTLY and refresh it
  //                           in the background (fast responses, data stays
  //                           near-live without ever blocking the user).
  //   3) age >= max / none -> block once on a fresh fetch; on failure fall back
  //                           to whatever stale value we still hold.
  async get(path, params, ttlMs) {
    const qs = new URLSearchParams(params).toString();
    const key = path + '?' + qs;
    const now = Date.now();
    const hit = this.cache.get(key);
    const age = hit ? now - hit.at : Infinity;

    if (hit && age < ttlMs) return hit.data;

    const staleMax = Math.max(ttlMs * 12, 60000);
    if (hit && age < staleMax) {
      this._refresh(key, path, qs).catch(() => {}); // revalidate in background
      return hit.data;                              // serve stale immediately
    }

    try {
      return await this._refresh(key, path, qs);
    } catch (e) {
      if (hit) return hit.data; // last resort: serve stale on upstream error
      throw e;
    }
  }
}
