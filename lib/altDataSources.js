// altDataSources.js
// ---------------------------------------------------------------------------
// Fallback market-data providers: OKX first, then Bybit. Each one returns data
// in the SAME SHAPE as Binance's public REST, so the rest of the app needs no
// changes. Called automatically by binanceFetch() when EVERY Binance host is
// blocked (HTTP 451/403) — e.g. on a restricted cloud region.
// Supported paths: /api/v3/ticker/24hr (all | symbols[] | single),
//                  /api/v3/klines, /api/v3/depth.
// (exchangeInfo stays Binance-only; it is tiny, cached for an hour, optional.)
// ---------------------------------------------------------------------------

const QUOTES = ['USDT','USDC','FDUSD','TUSD','BUSD','DAI','USD','BTC','ETH','BNB','EUR','TRY','BRL','GBP'];
function splitSymbol(sym) {
  sym = String(sym || '').toUpperCase();
  for (const q of QUOTES) { if (sym.endsWith(q) && sym.length > q.length) return { base: sym.slice(0, -q.length), quote: q }; }
  return { base: sym.slice(0, -4), quote: sym.slice(-4) };
}
async function getJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'apex-price-server/1.0' }, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

let _lastAltSource = '';
export function getLastAltSource() { return _lastAltSource; }

// interval maps (Binance -> provider)
const OKX_BAR = { '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','1w':'1W','1M':'1M' };
const BYBIT_IV = { '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','1w':'W','1M':'M' };

// ---------- OKX ----------
const OKX = 'https://www.okx.com';
function okxToBinance(d) {
  const last = +d.last, open = +d.open24h || last;
  const pct = open ? ((last - open) / open * 100) : 0;
  return { symbol: String(d.instId || '').replace(/-/g, ''), lastPrice: String(last),
    priceChangePercent: pct.toFixed(4), highPrice: String(d.high24h || ''), lowPrice: String(d.low24h || ''),
    openPrice: String(open), volume: String(d.vol24h || '0'), quoteVolume: String(d.volCcy24h || '0') };
}
const OKX_PROVIDER = {
  name: 'OKX',
  async ticker24h(symbol) { const s = splitSymbol(symbol);
    const j = await getJSON(`${OKX}/api/v5/market/ticker?instId=${s.base}-${s.quote}`, 6000);
    if (!j || j.code !== '0' || !j.data || !j.data[0]) throw new Error('okx ticker'); return okxToBinance(j.data[0]); },
  async ticker24hAll() { const j = await getJSON(`${OKX}/api/v5/market/tickers?instType=SPOT`, 8000);
    if (!j || j.code !== '0' || !Array.isArray(j.data)) throw new Error('okx tickers'); return j.data.map(okxToBinance); },
  async klines(symbol, interval, limit) { const s = splitSymbol(symbol); const bar = OKX_BAR[interval]; if (!bar) throw new Error('okx bar');
    const j = await getJSON(`${OKX}/api/v5/market/candles?instId=${s.base}-${s.quote}&bar=${bar}&limit=${Math.min(300, limit || 300)}`, 8000);
    if (!j || j.code !== '0' || !Array.isArray(j.data)) throw new Error('okx candles');
    return j.data.map((k) => [+k[0], k[1], k[2], k[3], k[4], k[5], +k[0] + 1, k[6] || '0', 0, '0', '0', '0']).reverse(); },
  async depth(symbol, limit) { const s = splitSymbol(symbol);
    const j = await getJSON(`${OKX}/api/v5/market/books?instId=${s.base}-${s.quote}&sz=${Math.min(400, limit || 20)}`, 6000);
    if (!j || j.code !== '0' || !j.data || !j.data[0]) throw new Error('okx books'); const d = j.data[0];
    return { lastUpdateId: Date.now(), bids: (d.bids || []).map((b) => [b[0], b[1]]), asks: (d.asks || []).map((a) => [a[0], a[1]]) }; },
};

// ---------- Bybit ----------
const BYBIT = 'https://api.bybit.com';
function bybitToBinance(d) {
  const pct = (+d.price24hPcnt || 0) * 100;
  return { symbol: d.symbol, lastPrice: String(d.lastPrice || ''), priceChangePercent: pct.toFixed(4),
    highPrice: String(d.highPrice24h || ''), lowPrice: String(d.lowPrice24h || ''), openPrice: String(d.prevPrice24h || ''),
    volume: String(d.volume24h || '0'), quoteVolume: String(d.turnover24h || '0') };
}
const BYBIT_PROVIDER = {
  name: 'Bybit',
  async ticker24h(symbol) { const j = await getJSON(`${BYBIT}/v5/market/tickers?category=spot&symbol=${symbol}`, 6000);
    const l = j && j.result && j.result.list; if (!l || !l[0]) throw new Error('bybit ticker'); return bybitToBinance(l[0]); },
  async ticker24hAll() { const j = await getJSON(`${BYBIT}/v5/market/tickers?category=spot`, 8000);
    const l = j && j.result && j.result.list; if (!Array.isArray(l)) throw new Error('bybit tickers'); return l.map(bybitToBinance); },
  async klines(symbol, interval, limit) { const iv = BYBIT_IV[interval]; if (!iv) throw new Error('bybit iv');
    const j = await getJSON(`${BYBIT}/v5/market/kline?category=spot&symbol=${symbol}&interval=${iv}&limit=${Math.min(1000, limit || 300)}`, 8000);
    const l = j && j.result && j.result.list; if (!Array.isArray(l)) throw new Error('bybit kline');
    return l.map((k) => [+k[0], k[1], k[2], k[3], k[4], k[5], +k[0] + 1, k[6] || '0', 0, '0', '0', '0']).reverse(); },
  async depth(symbol, limit) { const j = await getJSON(`${BYBIT}/v5/market/orderbook?category=spot&symbol=${symbol}&limit=${Math.min(200, limit || 20)}`, 6000);
    const r = j && j.result; if (!r) throw new Error('bybit book');
    return { lastUpdateId: Date.now(), bids: (r.b || []).map((b) => [b[0], b[1]]), asks: (r.a || []).map((a) => [a[0], a[1]]) }; },
};

const PROVIDERS = [OKX_PROVIDER, BYBIT_PROVIDER];

// Route a Binance-style request to the first alt provider that answers.
// Returns Binance-shaped data, or null if no provider could serve this path.
export async function altFetch(path, qs) {
  const p = new URLSearchParams(qs || '');
  const symbol = (p.get('symbol') || '').toUpperCase();
  for (const prov of PROVIDERS) {
    try {
      let out = null;
      if (path === '/api/v3/ticker/24hr') {
        if (p.get('symbols')) {
          let syms = []; try { syms = JSON.parse(p.get('symbols')); } catch (e) { syms = []; }
          const set = new Set(syms.map((s) => String(s).toUpperCase()));
          const all = await prov.ticker24hAll();
          out = all.filter((t) => set.has(t.symbol));
        } else if (symbol) { out = await prov.ticker24h(symbol); }
        else { out = await prov.ticker24hAll(); }
      } else if (path === '/api/v3/klines') {
        out = await prov.klines(symbol, p.get('interval') || '1m', Number(p.get('limit')) || 300);
      } else if (path === '/api/v3/depth') {
        out = await prov.depth(symbol, Number(p.get('limit')) || 20);
      } else { return null; }
      if (out != null) { _lastAltSource = prov.name; return out; }
    } catch (e) { /* provider failed -> try the next one */ }
  }
  return null;
}
