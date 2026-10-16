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

  createUser({ name, email, password, country }) {
    email = String(email || '').toLowerCase();
    const user = {
      id: randomUUID(),
      uid: Store.uidFromEmail(email),
      name: String(name || '').trim(),
      email,
      country: String(country || '').trim(),
      passHash: Store.hash(password),
      status: 'pending', // pending | approved | rejected | banned
      reason: '',
      createdAt: Date.now(),
      reviewedAt: 0,
    };
    this.db.users.push(user);
    this._save();
    return user;
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
  return { id: u.id, uid: u.uid, name: u.name, email: u.email, country: u.country, status: u.status, createdAt: u.createdAt, reviewedAt: u.reviewedAt, reason: u.reason };
}
