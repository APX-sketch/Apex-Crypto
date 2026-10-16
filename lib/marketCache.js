// marketCache.js
// Caches the FULL Binance 24h ticker list (all trading pairs) on the SERVER.
// The markets page reads from here (our server), so no user's browser ever
// talks to Binance directly. One request from us every refreshMs, no matter
// how many users are online — this is what prevents the ban.

const BINANCE_ALL = 'https://api.binance.com/api/v3/ticker/24hr';

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
    const res = await fetch(BINANCE_ALL, { headers: { 'User-Agent': 'apex-price-server/1.0' } });
    if (!res.ok) throw new Error(`Binance responded ${res.status}`);
    const arr = await res.json();
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
