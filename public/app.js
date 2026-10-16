// Reads prices and alerts from OUR server (never from Binance directly).
const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 });

async function loadPrices() {
  try {
    const res = await fetch('/api/prices');
    const json = await res.json();
    const tbody = document.getElementById('rows');
    tbody.replaceChildren();
    for (const p of json.data) {
      const tr = document.createElement('tr');
      const c1 = document.createElement('td');
      c1.textContent = p.symbol;
      const c2 = document.createElement('td');
      c2.textContent = fmt(p.price);
      const c3 = document.createElement('td');
      c3.textContent = `${p.changePct24h >= 0 ? '+' : ''}${p.changePct24h.toFixed(2)}%`;
      c3.className = p.changePct24h >= 0 ? 'up' : 'down';
      tr.append(c1, c2, c3);
      tbody.appendChild(tr);
    }
    document.getElementById('updated').textContent =
      '\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B: ' + new Date(json.updatedAt).toLocaleTimeString('ar');
  } catch (e) {
    // network error handled silently; will retry on next tick
  }
}

async function loadAlerts() {
  try {
    const res = await fetch('/api/alerts');
    const json = await res.json();
    const box = document.getElementById('alerts');
    box.replaceChildren();
    if (!json.data.length) {
      const d = document.createElement('div');
      d.className = 'muted';
      d.textContent = '\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u062D\u0627\u0644\u064A\u0627\u064B.';
      box.appendChild(d);
      return;
    }
    for (const a of json.data.slice(0, 10)) {
      const d = document.createElement('div');
      d.className = 'alert';
      const arrow = a.direction === 'up' ? '\u25B2' : '\u25BC';
      d.textContent = `${arrow} ${a.symbol}: ${a.changePct24h.toFixed(2)}% \u2014 ${new Date(a.at).toLocaleTimeString('ar')}`;
      box.appendChild(d);
    }
  } catch (e) { /* retry next tick */ }
}

function tick() { loadPrices(); loadAlerts(); }
window.addEventListener('DOMContentLoaded', () => {
  tick();
  setInterval(tick, 5000);
});
