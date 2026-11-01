import fs from 'node:fs';
import path from 'node:path';
import { readRide } from './recorder';

const SYNC_TIMEOUT_MS = 10_000;

/** Transfers local rides after the fact. Errors have no consequences; local data is never deleted. */
export class SyncClient {
  private running = false;
  constructor(private opts: { baseUrl: string; token: string; dir: string; batchSize?: number }) {}

  async syncAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const done = this.loadDone();
      for (const name of fs.readdirSync(this.opts.dir)) {
        if (done.has(name) || !fs.existsSync(path.join(this.opts.dir, name, 'meta.json'))) continue;
        try {
          if (await this.syncRide(name)) {
            done.add(name);
            this.saveDone(done);
          }
        } catch { /* Try again on the next run; a broken ride does not hold up the others. */ }
      }
    } finally {
      this.running = false;
    }
  }

  private loadDone(): Set<string> {
    try { return new Set(JSON.parse(fs.readFileSync(this.doneFile(), 'utf8')) as string[]); } catch { return new Set(); }
  }
  private saveDone(done: Set<string>): void { fs.writeFileSync(this.doneFile(), JSON.stringify([...done])); }
  private doneFile(): string { return path.join(this.opts.dir, 'synced.json'); }

  /** Returns true if the ride is finished and completely transferred. */
  private async syncRide(rideId: string): Promise<boolean> {
    const { meta, samples, events } = readRide(this.opts.dir, rideId);
    const { lastSeq, eventCount } = (await (await this.call(`/rides/${rideId}/progress`)).json()) as { lastSeq: number; eventCount: number };
    await this.call(`/rides/${rideId}/meta`, 'PUT', meta);
    if (meta.status === 'discarded') return true; // The server only learns about the discard, the data stays local.
    const missing = samples.filter((s) => s.seq > lastSeq);
    const size = this.opts.batchSize ?? 500;
    for (let i = 0; i < missing.length; i += size) {
      await this.call(`/rides/${rideId}/samples`, 'POST', missing.slice(i, i + size));
    }
    if (events.length > eventCount) {
      await this.call(`/rides/${rideId}/events`, 'POST', { startIndex: eventCount, events: events.slice(eventCount) });
    }
    return meta.status !== 'open';
  }

  private async call(url: string, method = 'GET', body?: unknown): Promise<Response> {
    const res = await fetch(`${this.opts.baseUrl}${url}`, {
      method,
      headers: { authorization: `Bearer ${this.opts.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Sync ${res.status}`);
    return res;
  }
}
