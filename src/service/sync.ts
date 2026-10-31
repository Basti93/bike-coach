import fs from 'node:fs';
import path from 'node:path';
import { readRide } from './recorder';

const SYNC_TIMEOUT_MS = 10_000;

/** Überträgt lokale Fahrten nachträglich. Fehler bleiben folgenlos; lokale Daten werden nie gelöscht. */
export class SyncClient {
  private running = false;
  constructor(private opts: { baseUrl: string; token: string; dir: string; batchSize?: number }) {}

  async syncAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const name of fs.readdirSync(this.opts.dir)) {
        if (fs.existsSync(path.join(this.opts.dir, name, 'meta.json'))) await this.syncRide(name);
      }
    } catch {
      /* Server nicht erreichbar: beim nächsten Lauf erneut */
    } finally {
      this.running = false;
    }
  }

  private async syncRide(rideId: string): Promise<void> {
    const { meta, samples, events } = readRide(this.opts.dir, rideId);
    const { lastSeq, eventCount } = (await (await this.call(`/rides/${rideId}/progress`)).json()) as { lastSeq: number; eventCount: number };
    await this.call(`/rides/${rideId}/meta`, 'PUT', meta);
    const missing = samples.filter((s) => s.seq > lastSeq);
    const size = this.opts.batchSize ?? 500;
    for (let i = 0; i < missing.length; i += size) {
      await this.call(`/rides/${rideId}/samples`, 'POST', missing.slice(i, i + size));
    }
    if (events.length > eventCount) {
      await this.call(`/rides/${rideId}/events`, 'POST', { startIndex: eventCount, events: events.slice(eventCount) });
    }
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
