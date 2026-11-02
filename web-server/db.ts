import { DatabaseSync } from 'node:sqlite';

export const openDb = (path: string): DatabaseSync => {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, expires_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS records (account_id INTEGER NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_ms REAL NOT NULL, deleted INTEGER NOT NULL, body TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (account_id, kind, id));
    CREATE INDEX IF NOT EXISTS records_seq ON records (account_id, seq);
    CREATE TABLE IF NOT EXISTS overwritten (n INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_ms REAL NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (at_ms INTEGER NOT NULL, ip TEXT NOT NULL, account_key TEXT NOT NULL);`);
  return db;
};
