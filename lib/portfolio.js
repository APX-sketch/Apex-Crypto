// portfolio.js
// Honest, computable profit/PnL for a user account.
//
// KEY RULE (as requested): DEPOSITS ARE NOT PROFIT.
// Profit = current market value of holdings - cost basis of those holdings.
// Cash deposited by the user is capital in, not gain. Every new account starts
// with a ZERO balance and zero holdings.
//
// This is an in-memory reference implementation. For production, replace the
// Map with a real database and add authentication + an audit log.

export class PortfolioStore {
  constructor(priceCache) {
    this.priceCache = priceCache;
    this.accounts = new Map(); // userId -> account
  }

  createAccount(userId) {
    if (this.accounts.has(userId)) return this.accounts.get(userId);
    const acc = {
      userId,
      cashBalance: 0,      // new account => zero balance
      totalDeposited: 0,   // tracked separately, never counted as profit
      holdings: [],        // [{ symbol, amount, costBasis }]
      createdAt: Date.now(),
    };
    this.accounts.set(userId, acc);
    return acc;
  }

  get(userId) {
    return this.accounts.get(userId) || null;
  }

  // Record capital the user put in. This raises cashBalance and totalDeposited
  // but does NOT create any profit.
  recordDeposit(userId, amount) {
    const acc = this.createAccount(userId);
    if (amount <= 0) throw new Error('deposit must be positive');
    acc.cashBalance += amount;
    acc.totalDeposited += amount;
    return acc;
  }

  // Add a holding with a real cost basis (e.g. bought at market price).
  addHolding(userId, symbol, amount, unitCost) {
    const acc = this.createAccount(userId);
    acc.holdings.push({ symbol, amount, costBasis: amount * unitCost });
    return acc;
  }

  // Current market value of a symbol amount, using OUR cached price.
  _marketValue(symbol, amount) {
    const p = this.priceCache.get(symbol);
    return p ? amount * p.price : 0;
  }

  // Value of a holding 24h ago, derived from the real 24h change percent.
  _value24hAgo(symbol, amount) {
    const p = this.priceCache.get(symbol);
    if (!p) return 0;
    const priceNow = p.price;
    const price24hAgo = priceNow / (1 + p.changePct24h / 100);
    return amount * price24hAgo;
  }

  // Returns balance + honest profit numbers for the wallet page.
  summary(userId) {
    const acc = this.get(userId);
    if (!acc) return null;

    let holdingsValue = 0;
    let holdingsCost = 0;
    let holdingsValue24hAgo = 0;

    for (const h of acc.holdings) {
      holdingsValue += this._marketValue(h.symbol, h.amount);
      holdingsCost += h.costBasis;
      holdingsValue24hAgo += this._value24hAgo(h.symbol, h.amount);
    }

    const totalBalance = acc.cashBalance + holdingsValue;

    // Total profit = market value of holdings - what they cost. Deposits excluded.
    const totalProfit = holdingsValue - holdingsCost;
    const totalProfitPct = holdingsCost > 0 ? (totalProfit / holdingsCost) * 100 : 0;

    // 24h profit = change in holdings value over the last 24h (real prices).
    const profit24h = holdingsValue - holdingsValue24hAgo;
    const profit24hPct = holdingsValue24hAgo > 0
      ? (profit24h / holdingsValue24hAgo) * 100
      : 0;

    return {
      userId: acc.userId,
      balance: round(totalBalance),
      cashBalance: round(acc.cashBalance),
      holdingsValue: round(holdingsValue),
      totalDeposited: round(acc.totalDeposited),
      totalProfit: round(totalProfit),
      totalProfitPct: round(totalProfitPct),
      profit24h: round(profit24h),
      profit24hPct: round(profit24hPct),
    };
  }
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
