// priceCache.js
// Polls Binance public market-data endpoints on the SERVER side and keeps an
// in-memory cache. Clients read from THIS cache (our server), never directly
// from Binance — so all end-user traffic hits us, not Binance. This is the
// standard way to avoid rate-limit bans: one request every REFRESH_MS from us,
// instead of thousands of requests from every user.

import { EventEmitter } from 'node:events';
import { binanceFetch } from './binanceHosts.js';

export class PriceCache extends EventEmitter {
  constructor({ symbols, refreshMs, alertThreshold, alertSymbols }) {
    super();
    this.symbols = symbols;
    this.refreshMs = refreshMs;
    this.alertThreshold = alertThreshold;
    this.alertSymbols = new Set(alertSymbols);
    this.cache = new Map();      // symbol -> { symbol, price, changePct24h, high, low, volume, updatedAt }
    this.alerts = [];            // recent alerts (max 100)
    this._lastAlerted = new Map();
    this._timer = null;
  }

  start() {
    this.refresh().catch(() => {});
    this._timer = setInterval(() => this.refresh().catch(() => {}), this.refreshMs);
    // Do not keep the event loop alive solely for the timer.
    if (this._timer.unref) this._timer.unref();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async refresh() {
    // Binance accepts a JSON array of symbols via the `symbols` query param.
    const symbolsParam = encodeURIComponent(JSON.stringify(this.symbols));

    let data;
    try {
      // data-api.binance.vision first (cloud-IP safe), then api hosts fallback.
      data = await binanceFetch('/api/v3/ticker/24hr', 'symbols=' + symbolsParam);
    } catch (e) {
      this.emit('error', e);
      return;
    }
    const list = Array.isArray(data) ? data : [data];
    const now = Date.now();

    for (const t of list) {
      const entry = {
        symbol: t.symbol,
        price: Number(t.lastPrice),
        changePct24h: Number(t.priceChangePercent),
        high: Number(t.highPrice),
        low: Number(t.lowPrice),
        volume: Number(t.volume),
        updatedAt: now,
      };
      this.cache.set(t.symbol, entry);
      this._maybeAlert(entry);
    }
    this.emit('update', this.getAll());
  }

  _maybeAlert(entry) {
    if (!this.alertSymbols.has(entry.symbol)) return;
    if (Math.abs(entry.changePct24h) < this.alertThreshold) return;

    // Avoid spamming: only re-alert if the rounded percent changed.
    const key = `${entry.symbol}:${Math.round(entry.changePct24h)}`;
    if (this._lastAlerted.get(entry.symbol) === key) return;
    this._lastAlerted.set(entry.symbol, key);

    const alert = {
      symbol: entry.symbol,
      changePct24h: entry.changePct24h,
      price: entry.price,
      direction: entry.changePct24h >= 0 ? 'up' : 'down',
      threshold: this.alertThreshold,
      at: entry.updatedAt,
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 100) this.alerts.pop();
    this.emit('alert', alert);
  }

  get(symbol) {
    return this.cache.get(symbol) || null;
  }

  getAll() {
    return Array.from(this.cache.values());
  }

  getAlerts() {
    return this.alerts;
  }
}
