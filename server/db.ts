import { DatabaseSync } from 'node:sqlite';

export const openDb = (path: string): DatabaseSync => {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rides (ride_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS samples (ride_id TEXT NOT NULL, seq INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (ride_id, seq));
    CREATE TABLE IF NOT EXISTS coach (profile_id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (ride_id TEXT NOT NULL, idx INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (ride_id, idx));`);
  return db;
};
