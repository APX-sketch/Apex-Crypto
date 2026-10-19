// lib/store.js
// Simple JSON-file backed store for the Apex demo backend:
//   - users (registration requests + approval status)
//   - sessions (bearer tokens)
//   - support chat threads (one per user)
// DEMO-GRADE persistence: a single JSON file with synchronous writes.
// For production replace with a real database + migrations + backups.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export class Store {
  constructor(file) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
    this._load();
  }

  _load() {
    if (existsSync(this.file)) {
      try {
        this.db = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch {
        this.db = null;
      }
    }
    if (!this.db || typeof this.db !== 'object') {
      this.db = { users: [], sessions: {}, adminSessions: {}, chats: {} };
    }
    this.db.users ||= [];
    this.db.sessions ||= {};
    this.db.adminSessions ||= {};
    this.db.chats ||= {};
    this.db.adminLogs ||= [];
    // ---- migrate existing accounts to the new wallet/notification model ----
    // Every account needs: a unique deposit address, an incoming-deposit
    // ledger, and a notifications inbox. Older records created before this
    // feature won't have them, so backfill + persist once on load.
    let migrated = false;
    for (const u of this.db.users) {
      if (!u.depositAddress) { u.depositAddress = this._genAddress(); migrated = true; }
      if (!Array.isArray(u.deposits)) { u.deposits = []; migrated = true; }
      if (!Array.isArray(u.notifications)) { u.notifications = []; migrated = true; }
      if (!Array.isArray(u.transactions)) { u.transactions = []; migrated = true; }
    }
    if (migrated) this._save();
  }

  // Generate a unique, human-shareable deposit address for an account.
  _genAddress() {
    let addr;
    do { addr = 'APX' + randomBytes(16).toString('hex'); }
    while (this.db.users && this.db.users.some((u) => u.depositAddress === addr));
    return addr;
  }

  _save() {
    writeFileSync(this.file, JSON.stringify(this.db, null, 2));
  }

  // ---- password hashing (scrypt, built-in) ----
  static hash(password) {
    const salt = randomBytes(16).toString('hex');
    const key = scryptSync(String(password), salt, 64).toString('hex');
    return `${salt}:${key}`;
  }

  static verify(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, key] = stored.split(':');
    const a = Buffer.from(key, 'hex');
    const b = scryptSync(String(password), salt, 64);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  static uidFromEmail(email) {
    let h = 0;
    email = String(email || '').toLowerCase();
    for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
    return 100000000 + (h % 900000000);
  }

  // ---- users ----
  findUserByEmail(email) {
    email = String(email || '').toLowerCase();
    return this.db.users.find((u) => u.email === email) || null;
  }

  findUserById(id) {
    return this.db.users.find((u) => u.id === id) || null;
  }

  createUser({ name, email, password, country, idDocType, idImage }) {
    email = String(email || '').toLowerCase();
    const type = String(idDocType || '').trim().slice(0, 20);
    // Store the identity document (base64 data URL) submitted at registration
    // so the admin can review it. DEMO-grade: kept inline in the JSON store.
    const idDoc = (idImage && typeof idImage === 'string')
      ? { type, image: String(idImage).slice(0, 3000000), at: Date.now() }
      : null;
    const user = {
      id: randomUUID(),
      uid: Store.uidFromEmail(email),
      name: String(name || '').trim(),
      email,
      country: String(country || '').trim(),
      passHash: Store.hash(password),
      status: 'pending', // pending | approved | rejected | banned
      reason: '',
      idDoc, // { type, image(dataURL), at } | null
      createdAt: Date.now(),
      reviewedAt: 0,
      balances: {},
      depositAddress: this._genAddress(), // unique address others transfer to
      deposits: [],       // incoming credit ledger (transfers in / admin credit)
      transactions: [],   // full financial activity log (in + out, display only)
      notifications: [],  // admin -> user notifications inbox
      lastSeen: 0,
    };
    this.db.users.push(user);
    this._save();
    return user;
  }

  // ---- unified ledger bootstrap (single source of truth for balances) ----
  // Create (or return) a ledger record for an account whose IDENTITY lives in
  // an EXTERNAL store (MySQL). The ledger record is keyed by the SAME id the
  // rest of the app uses (the MySQL id as a string), so balances, deposits,
  // transactions and notifications all live in ONE place here. This makes the
  // store the single source of truth for spendable balances, which both the
  // trading pages and the withdraw endpoint now share.
  //
  // Idempotent & SAFE: it NEVER overwrites an existing balance; it only
  // backfills missing structure and fills identity fields (name/email/country)
  // when they are still empty.
  ensureUser(id, fields = {}) {
    const key = String(id || '').trim();
    if (!key) return null;
    let u = this.db.users.find((x) => x.id === key);
    if (!u) {
      u = {
        id: key,
        uid: (fields.uid != null) ? fields.uid : Store.uidFromEmail(fields.email || key),
        name: String(fields.name || '').trim(),
        email: String(fields.email || '').toLowerCase().trim(),
        country: String(fields.country || '').trim(),
        passHash: '',               // identity/auth lives in the external (MySQL) store
        status: fields.status || 'approved',
        reason: '',
        idDoc: null,
        createdAt: Date.now(),
        reviewedAt: 0,
        balances: {},
        depositAddress: this._genAddress(),
        deposits: [],
        transactions: [],
        notifications: [],
        lastSeen: 0,
        external: true,             // flags a ledger record backed by MySQL identity
      };
      this.db.users.push(u);
      this._save();
      return u;
    }
    // existing record: backfill structure + fresh identity, never touch balances
    let changed = false;
    if (!u.depositAddress) { u.depositAddress = this._genAddress(); changed = true; }
    if (!Array.isArray(u.deposits)) { u.deposits = []; changed = true; }
    if (!Array.isArray(u.transactions)) { u.transactions = []; changed = true; }
    if (!Array.isArray(u.notifications)) { u.notifications = []; changed = true; }
    if (!u.balances || typeof u.balances !== 'object') { u.balances = {}; changed = true; }
    if (fields.name && !u.name) { u.name = String(fields.name).trim(); changed = true; }
    if (fields.email && !u.email) { u.email = String(fields.email).toLowerCase().trim(); changed = true; }
    if (fields.country && !u.country) { u.country = String(fields.country).trim(); changed = true; }
    if (changed) this._save();
    return u;
  }

  // Return the raw identity document for one user (admin review only).
  getIdDoc(id) {
    const u = this.findUserById(id);
    return (u && u.idDoc) ? u.idDoc : null;
  }

  // Replace a user's identity document (used when they re-verify after a
  // rejection). Stores the new base64 image + type and timestamps it.
  setIdDoc(id, type, image) {
    const u = this.findUserById(id);
    if (!u) return null;
    u.idDoc = {
      type: String(type || '').trim().slice(0, 20),
      image: String(image || '').slice(0, 3000000),
      at: Date.now(),
    };
    this._save();
    return u;
  }

  // ---- live balances (reported by the client) ----
  setBalances(id, balances) {
    const u = this.findUserById(id);
    if (!u) return null;
    const clean = {};
    for (const k in (balances || {})) {
      const sym = String(k).toUpperCase().slice(0, 12);
      const n = Number(balances[k]);
      if (/^[A-Z0-9]{2,12}$/.test(sym) && isFinite(n) && n >= 0) clean[sym] = n;
    }
    u.balances = clean;
    u.lastSeen = Date.now();
    this._save();
    return u;
  }

  // ---- presence heartbeat ----
  // Mark the account as recently active WITHOUT touching balances. Pages call
  // this on load and on an interval so the admin "active/online" flag is
  // accurate even when the user is just browsing (not trading).
  touchSeen(id) {
    const u = this.findUserById(id);
    if (!u) return null;
    u.lastSeen = Date.now();
    this._save();
    return u;
  }

  // ---- apply trade deltas (server is the source of truth) ----
  // `deltas` is a map of currency -> signed change, e.g. { USDT: -50.25,
  // BTC: +0.001 }. Applied additively and atomically on the server. Rejects
  // (returns null) if any resulting balance would go negative, so the client
  // can never desync the authoritative balance. Also refreshes lastSeen.
  applyDeltas(id, deltas) {
    const u = this.findUserById(id);
    if (!u) return null;
    u.balances ||= {};
    const next = { ...u.balances };
    const EPS = 1e-8;
    for (const k in (deltas || {})) {
      const sym = String(k).toUpperCase().slice(0, 12);
      if (!/^[A-Z0-9]{2,12}$/.test(sym)) continue;
      const d = Number(deltas[k]);
      if (!isFinite(d)) continue;
      const v = (Number(next[sym]) || 0) + d;
      if (v < -EPS) return null; // insufficient balance for this delta
      next[sym] = v < 0 ? 0 : +v.toFixed(8);
    }
    u.balances = next;
    u.lastSeen = Date.now();
    this._save();
    return u;
  }

  // ---- deposit address / incoming-deposit ledger ----
  // Look a user up by their public deposit address (used by transfers).
  getUserByAddress(addr) {
    addr = String(addr || '').trim();
    if (!addr) return null;
    return this.db.users.find((u) => u.depositAddress === addr) || null;
  }

  // Record an incoming credit for a user. `kind` is 'transfer' | 'admin'.
  addDeposit(userId, { amount, currency, from, fromName, kind, note } = {}) {
    const u = this.findUserById(userId);
    if (!u) return null;
    const dep = {
      id: randomUUID(),
      amount: Number(amount) || 0,
      currency: String(currency || 'USDT').toUpperCase().slice(0, 12),
      from: String(from || '').slice(0, 120),
      fromName: String(fromName || '').slice(0, 80),
      kind: kind === 'admin' ? 'admin' : 'transfer',
      note: String(note || '').slice(0, 200),
      at: Date.now(),
    };
    u.deposits ||= [];
    u.deposits.push(dep);
    // ---- credit the account balance (server is the source of truth) ----
    u.balances ||= {};
    const sym = dep.currency;
    u.balances[sym] = (Number(u.balances[sym]) || 0) + dep.amount;
    this._save();
    return dep;
  }

  // Deduct from an account balance (used by outgoing transfers). Returns the
  // updated user on success, or null when the balance is insufficient.
  debitBalance(userId, currency, amount) {
    const u = this.findUserById(userId);
    if (!u) return null;
    const sym = String(currency || 'USDT').toUpperCase().slice(0, 12);
    const amt = Number(amount) || 0;
    u.balances ||= {};
    const have = Number(u.balances[sym]) || 0;
    if (amt <= 0 || have < amt) return null;
    u.balances[sym] = have - amt;
    this._save();
    return u;
  }

  getDeposits(userId) {
    const u = this.findUserById(userId);
    return (u && u.deposits) ? u.deposits.slice().sort((a, b) => b.at - a.at) : [];
  }

  // ---- financial activity ledger (display only; does NOT move money) ----
  // Records every money movement for a user so the admin can audit deposits,
  // incoming/outgoing transfers and admin credits. `type` is one of:
  // 'admin_credit' | 'transfer_in' | 'transfer_out'.
  addTransaction(userId, { type, amount, currency, counterparty, note } = {}) {
    const u = this.findUserById(userId);
    if (!u) return null;
    const tx = {
      id: randomUUID(),
      type: String(type || 'admin_credit'),
      amount: Number(amount) || 0,
      currency: String(currency || 'USDT').toUpperCase().slice(0, 12),
      counterparty: String(counterparty || '').slice(0, 120),
      note: String(note || '').slice(0, 200),
      at: Date.now(),
    };
    u.transactions ||= [];
    u.transactions.push(tx);
    this._save();
    return tx;
  }

  getTransactions(userId) {
    const u = this.findUserById(userId);
    return (u && u.transactions) ? u.transactions.slice().sort((a, b) => b.at - a.at) : [];
  }

  // Flat list across all accounts (each row carries owner name/email/uid).
  getAllTransactions() {
    const rows = [];
    for (const u of this.db.users) {
      for (const tx of (u.transactions || [])) {
        rows.push({
          userId: u.id, uid: u.uid, userName: u.name || '', userEmail: u.email || '',
          ...tx,
        });
      }
    }
    return rows.sort((a, b) => b.at - a.at);
  }

  // ---- admin activity log (who did what, for credits/balance edits/etc.) ----
  logAdmin({ admin, action, targetId, targetEmail, targetName, amount, currency, note } = {}) {
    const entry = {
      id: randomUUID(),
      admin: String(admin || 'admin').slice(0, 60),
      action: String(action || '').slice(0, 40),
      targetId: String(targetId || ''),
      targetEmail: String(targetEmail || '').slice(0, 120),
      targetName: String(targetName || '').slice(0, 120),
      amount: (amount === undefined || amount === null) ? null : (Number(amount) || 0),
      currency: currency ? String(currency).toUpperCase().slice(0, 12) : '',
      note: String(note || '').slice(0, 200),
      at: Date.now(),
    };
    this.db.adminLogs ||= [];
    this.db.adminLogs.push(entry);
    // keep the log bounded
    if (this.db.adminLogs.length > 2000) this.db.adminLogs = this.db.adminLogs.slice(-2000);
    this._save();
    return entry;
  }

  getAdminLogs() {
    return (this.db.adminLogs || []).slice().sort((a, b) => b.at - a.at);
  }

  // ---- notifications inbox (admin -> user) ----
  addNotification(userId, { title, body } = {}) {
    const u = this.findUserById(userId);
    if (!u) return null;
    const n = {
      id: randomUUID(),
      title: String(title || '').slice(0, 120),
      body: String(body || '').slice(0, 1000),
      read: false,
      at: Date.now(),
    };
    u.notifications ||= [];
    u.notifications.push(n);
    this._save();
    return n;
  }

  getNotifications(userId) {
    const u = this.findUserById(userId);
    return (u && u.notifications) ? u.notifications.slice().sort((a, b) => b.at - a.at) : [];
  }

  unreadNotifCount(userId) {
    const u = this.findUserById(userId);
    return (u && u.notifications) ? u.notifications.filter((n) => !n.read).length : 0;
  }

  // Mark one notification read (by id) or all of them (id omitted).
  markNotifRead(userId, id) {
    const u = this.findUserById(userId);
    if (!u || !u.notifications) return;
    u.notifications.forEach((n) => { if (!id || n.id === id) n.read = true; });
    this._save();
  }

  setUserStatus(id, status, reason = '') {
    const u = this.findUserById(id);
    if (!u) return null;
    u.status = status;
    u.reason = reason;
    u.reviewedAt = Date.now();
    this._save();
    return u;
  }

  deleteUser(id) {
    const n = this.db.users.length;
    this.db.users = this.db.users.filter((u) => u.id !== id);
    delete this.db.chats[id];
    this._save();
    return this.db.users.length < n;
  }

  listUsers(status) {
    const arr = status ? this.db.users.filter((u) => u.status === status) : this.db.users.slice();
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }

  stats() {
    const s = { total: this.db.users.length, pending: 0, approved: 0, rejected: 0, banned: 0, openChats: 0 };
    for (const u of this.db.users) if (s[u.status] != null) s[u.status]++;
    for (const id in this.db.chats) {
      const t = this.db.chats[id];
      if (t && t.messages && t.messages.length && t.unreadForAdmin) s.openChats++;
    }
    return s;
  }

  // ---- sessions (user) ----
  createSession(userId) {
    const token = randomBytes(24).toString('hex');
    this.db.sessions[token] = { userId, createdAt: Date.now() };
    this._save();
    return token;
  }

  userIdForToken(token) {
    const s = this.db.sessions[token];
    return s ? s.userId : null;
  }

  destroySession(token) {
    delete this.db.sessions[token];
    this._save();
  }

  // ---- admin sessions ----
  createAdminSession() {
    const token = randomBytes(24).toString('hex');
    this.db.adminSessions[token] = { createdAt: Date.now() };
    this._save();
    return token;
  }

  isAdminToken(token) {
    return !!this.db.adminSessions[token];
  }

  // ---- support chat ----
  _thread(userId) {
    if (!this.db.chats[userId]) {
      this.db.chats[userId] = { messages: [], unreadForAdmin: 0, unreadForUser: 0 };
    }
    return this.db.chats[userId];
  }

  addMessage(userId, from, text) {
    const t = this._thread(userId);
    const msg = { id: randomUUID(), from, text: String(text).slice(0, 2000), at: Date.now() };
    t.messages.push(msg);
    if (from === 'user') t.unreadForAdmin++;
    else t.unreadForUser++;
    this._save();
    return msg;
  }

  getMessages(userId) {
    return this._thread(userId).messages;
  }

  markRead(userId, side) {
    const t = this._thread(userId);
    if (side === 'admin') t.unreadForAdmin = 0;
    else t.unreadForUser = 0;
    this._save();
  }

  listChats() {
    const out = [];
    for (const id in this.db.chats) {
      const u = this.findUserById(id);
      const t = this.db.chats[id];
      if (!t.messages.length) continue;
      out.push({
        userId: id,
        name: u ? u.name : 'مستخدم محذوف',
        email: u ? u.email : '',
        uid: u ? u.uid : '',
        last: t.messages[t.messages.length - 1],
        count: t.messages.length,
        unread: t.unreadForAdmin,
      });
    }
    return out.sort((a, b) => b.last.at - a.last.at);
  }
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, uid: u.uid, name: u.name, email: u.email, country: u.country, status: u.status, createdAt: u.createdAt, reviewedAt: u.reviewedAt, reason: u.reason, depositAddress: u.depositAddress || '', idDocType: (u.idDoc && u.idDoc.type) || '', hasIdDoc: !!(u.idDoc && u.idDoc.image) };
}
