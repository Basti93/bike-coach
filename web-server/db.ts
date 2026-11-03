import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const openDb = (path: string): DatabaseSync => {
  if (path !== ':memory:') {
    // Private data directory and files (umask is not available in worker threads, so it is best effort).
    try { process.umask(0o077); } catch { /* not supported here */ }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, expires_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS records (account_id INTEGER NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_ms REAL NOT NULL, deleted INTEGER NOT NULL, body TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (account_id, kind, id));
    CREATE INDEX IF NOT EXISTS records_seq ON records (account_id, seq);
    CREATE TABLE IF NOT EXISTS overwritten (n INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_ms REAL NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, stale INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS login_attempts (at_ms INTEGER NOT NULL, ip TEXT NOT NULL, account_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  // A database from before these columns gets them here.
  const columns = (db.prepare('PRAGMA table_info(overwritten)').all() as { name: string }[]).map((c) => c.name);
  for (const c of ['deleted', 'stale']) if (!columns.includes(c)) db.exec(`ALTER TABLE overwritten ADD COLUMN ${c} INTEGER NOT NULL DEFAULT 0`);
  settleGeneration(db);
  return db;
};

const metaValue = (db: DatabaseSync, key: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const writeGeneration = (db: DatabaseSync) => {
  db.prepare("INSERT OR REPLACE INTO meta VALUES ('generation', ?)").run(randomBytes(16).toString('hex'));
  db.exec("DELETE FROM meta WHERE key = 'from_backup'");
};

/**
 * The id of this database's history: devices start over when it changes. Created once. A backup file carries the
 * `from_backup` mark (see backup.sh), so the first open of a restored file gives it a new id; nothing here can be forgotten.
 */
function settleGeneration(db: DatabaseSync): void {
  if (metaValue(db, 'generation') && !metaValue(db, 'from_backup')) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!metaValue(db, 'generation') || metaValue(db, 'from_backup')) writeGeneration(db);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const generationOf = (db: DatabaseSync): string => metaValue(db, 'generation')!;
/** By hand, for a database file put back without a backup (a pre-restore copy). */
export const newGeneration = (db: DatabaseSync): void => writeGeneration(db);
