// marketCache.js
// Caches the FULL Binance 24h ticker list (all trading pairs) on the SERVER.
// The markets page reads from here (our server), so no user's browser ever
// talks to Binance directly. One request from us every refreshMs, no matter
// how many users are online — this is what prevents the ban.

import { binanceFetch } from './binanceHosts.js';

export class MarketCache {
  constructor({ refreshMs }) {
    this.refreshMs = refreshMs;
    this.data = [];        // slimmed array: { symbol, lastPrice, priceChangePercent, quoteVolume }
    this.updatedAt = 0;
    this._timer = null;
  }

  start() {
    this.refresh().catch((e) => console.warn('[marketCache]', e.message));
    this._timer = setInterval(
      () => this.refresh().catch((e) => console.warn('[marketCache]', e.message)),
      this.refreshMs,
    );
    if (this._timer.unref) this._timer.unref();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async refresh() {
    // Served from data-api.binance.vision first (cloud-IP safe), with fallback.
    const arr = await binanceFetch('/api/v3/ticker/24hr');
    // Keep only the fields the frontend needs (shrinks the payload a lot).
    this.data = arr.map((t) => ({
      symbol: t.symbol,
      lastPrice: t.lastPrice,
      priceChangePercent: t.priceChangePercent,
      quoteVolume: t.quoteVolume,
    }));
    this.updatedAt = Date.now();
  }

  getAll() {
    return this.data;
  }
}
