// SQLite via sql.js (WebAssembly) - no native modules to compile, nothing for endpoint
// security to flag. The database is kept in memory and flushed to disk atomically
// (write temp file -> rename) after every change.

import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'node:fs';
import { DB_FILE } from './paths';
import { resourcePath } from './paths';
import { log } from './log';

let db: Database | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS warrants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caseNumber TEXT NOT NULL DEFAULT '',
  warrantNumber TEXT NOT NULL DEFAULT '',
  warrantType TEXT NOT NULL DEFAULT 'premises',
  targets TEXT NOT NULL DEFAULT '',
  judge TEXT NOT NULL DEFAULT '',
  court TEXT NOT NULL DEFAULT '',
  signedDate TEXT NOT NULL,
  receivedDate TEXT,
  executedDate TEXT,
  returnDueDate TEXT NOT NULL,
  dueRule TEXT NOT NULL DEFAULT '',
  locations TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]',
  itemsText TEXT NOT NULL DEFAULT '',
  investigationNature TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  assignedTo TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notificationRequired INTEGER NOT NULL DEFAULT 0,
  notificationServedDate TEXT,
  filedDate TEXT,
  snoozeUntil TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_w_status ON warrants(status, deletedAt);
CREATE INDEX IF NOT EXISTS ix_w_due ON warrants(returnDueDate);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warrantId INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  originalName TEXT NOT NULL,
  storedName TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  generated INTEGER NOT NULL DEFAULT 0,
  templateName TEXT,
  addedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_a_w ON attachments(warrantId);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warrantId INTEGER,
  at TEXT NOT NULL,
  user TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_w ON audit(warrantId);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  builtIn INTEGER NOT NULL DEFAULT 0,
  isDefault INTEGER NOT NULL DEFAULT 0,
  fileName TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mapping TEXT NOT NULL DEFAULT '{}',
  outputPattern TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS amendments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warrantId INTEGER NOT NULL,
  number INTEGER NOT NULL,
  signedDate TEXT NOT NULL,
  judge TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  addedScope TEXT NOT NULL DEFAULT '',
  previousDueDate TEXT,
  newDueDate TEXT,
  attachmentId INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_amend_w ON amendments(warrantId);

CREATE TABLE IF NOT EXISTS reminders_sent (
  warrantId INTEGER NOT NULL,
  key TEXT NOT NULL,
  channel TEXT NOT NULL,
  sentAt TEXT NOT NULL,
  PRIMARY KEY (warrantId, key, channel)
);
`;

export async function openDb(): Promise<void> {
  SQL = await initSqlJs({ locateFile: () => resourcePath('sql-wasm.wasm') });
  if (existsSync(DB_FILE)) {
    try {
      db = new SQL.Database(readFileSync(DB_FILE));
      const res = db.exec('PRAGMA integrity_check');
      if (res[0]?.values[0]?.[0] !== 'ok') throw new Error('integrity_check failed');
    } catch (e) {
      const bad = `${DB_FILE}.corrupt-${Date.now()}`;
      log('error', `Database unreadable; preserved as ${bad}`, e);
      copyFileSync(DB_FILE, bad);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate();
  persist();
}

function migrate() {
  const v = Number(getMeta('schemaVersion') ?? 0);
  if (v < SCHEMA_VERSION) setMeta('schemaVersion', String(SCHEMA_VERSION));
}

export function getMeta(key: string): string | null {
  const r = get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return r?.value ?? null;
}
export function setMeta(key: string, value: string) {
  run('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

function d(): Database {
  if (!db) throw new Error('Database not open');
  return db;
}

export function all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
  const stmt = d().prepare(sql);
  try {
    stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    return out;
  } finally {
    stmt.free();
  }
}

export function get<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
  return all<T>(sql, params)[0];
}

/** Run a statement; returns last insert id. Does NOT persist - call persist() (or use tx()). */
export function run(sql: string, params: SqlValue[] = []): number {
  d().run(sql, params);
  const r = d().exec('SELECT last_insert_rowid()');
  return Number(r[0]?.values[0]?.[0] ?? 0);
}

/** Run a function in a transaction and persist to disk on success. */
export function tx<T>(fn: () => T): T {
  d().exec('BEGIN');
  try {
    const out = fn();
    d().exec('COMMIT');
    persist();
    return out;
  } catch (e) {
    try {
      d().exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }
}

export function persist() {
  const bytes = d().export();
  // sql.js export() resets pragmas; re-enable FK enforcement
  d().exec('PRAGMA foreign_keys = ON;');
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, DB_FILE);
}

export function closeDb() {
  if (db) {
    try {
      persist();
    } catch (e) {
      log('error', 'persist on close failed', e);
    }
    db.close();
    db = null;
  }
}

/** Replace the live database with bytes (used by restore). */
export function replaceDb(bytes: Uint8Array) {
  if (!SQL) throw new Error('sql.js not initialised');
  const next = new SQL.Database(bytes);
  const ok = next.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] === 'ok';
  if (!ok) {
    next.close();
    throw new Error('Backup database failed integrity check');
  }
  db?.close();
  db = next;
  db.exec(SCHEMA);
  migrate();
  persist();
}

/** Open an arbitrary SQLite file read-only (used for v1 import). */
export function openForeign(bytes: Uint8Array): Database {
  if (!SQL) throw new Error('sql.js not initialised');
  return new SQL.Database(bytes);
}

export function dbBytes(): Uint8Array {
  const b = d().export();
  d().exec('PRAGMA foreign_keys = ON;');
  return b;
}
