import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BlePort, DeviceKind } from './ble/device-port';

const KEEP_DAYS = 3;
const DATA_EVERY_MS = 1000;
const fileOf = (ms: number) => `diag-${new Date(ms).toISOString().slice(0, 10)}.jsonl`;

/**
 * Local record of the last days, so a problem on the bike can be found afterwards.
 * Everything runs in the background and errors go nowhere: a ride never waits for this log and never fails because of it.
 */
export class Diagnostics {
  private folder: string;
  private queue: Promise<unknown> = Promise.resolve();
  private currentFile: string | null = null;

  constructor(private dir: string, private nowMs: () => number) {
    this.folder = path.join(dir, 'diagnostics');
  }

  write(what: string, data: object = {}): void {
    const atMs = this.nowMs();
    const line = `${JSON.stringify({ atMs, what, ...data })}\n`;
    this.enqueue(async () => {
      const file = fileOf(atMs);
      await fs.promises.mkdir(this.folder, { recursive: true });
      await fs.promises.appendFile(path.join(this.folder, file), line);
      if (file !== this.currentFile) { this.currentFile = file; await this.prune(); }
    });
  }

  flushed(): Promise<void> { return this.queue.then(() => undefined); }

  /** Stays on this Mac; nothing is sent. */
  async report(note: string, status: object): Promise<string> {
    await this.flushed();
    const names = (await fs.promises.readdir(this.folder).catch(() => [] as string[])).filter((n) => n.startsWith('diag-')).sort();
    const logs = await Promise.all(names.map((n) => fs.promises.readFile(path.join(this.folder, n), 'utf8')));
    const now = this.nowMs();
    const text = [
      'Pandafit Problembericht', new Date(now).toISOString(), `${os.platform()} ${os.release()} ${os.arch()}`, '',
      'Was ist passiert:', note || '(keine Angabe)', '', 'Geräte:', JSON.stringify(status), '', 'Protokoll:', ...logs,
    ].join('\n');
    const folder = path.join(this.dir, 'reports');
    await fs.promises.mkdir(folder, { recursive: true });
    const file = path.join(folder, `report-${new Date(now).toISOString().replace(/[:.]/g, '-')}.txt`);
    await fs.promises.writeFile(file, text);
    return file;
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch(() => { /* see above */ });
  }

  private async prune(): Promise<void> {
    const names = (await fs.promises.readdir(this.folder)).filter((n) => n.startsWith('diag-')).sort();
    await Promise.all(names.slice(0, -KEEP_DAYS).map((n) => fs.promises.rm(path.join(this.folder, n), { force: true })));
  }
}

/** Records connections, drop-outs, commands and raw data, without changing what the port does. */
export const withDiagnostics = (port: BlePort, log: Diagnostics, nowMs: () => number): BlePort => {
  const lastData = new Map<DeviceKind, number>();
  const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return {
    connect: async (kind) => {
      log.write('connect-try', { kind });
      try {
        await port.connect(kind);
        log.write('connect-ok', { kind, name: port.deviceName?.(kind) ?? null });
      } catch (e) {
        log.write('connect-failed', { kind, reason: reason(e) });
        throw e;
      }
    },
    disconnect: (kind) => { log.write('disconnect', { kind }); return port.disconnect(kind); },
    subscribe: (kind, cb) => port.subscribe(kind, (b) => {
      const now = nowMs();
      if (now - (lastData.get(kind) ?? -Infinity) >= DATA_EVERY_MS) {
        lastData.set(kind, now);
        log.write('data', { kind, hex: b.toString('hex') });
      }
      cb(b);
    }),
    write: async (kind, b) => {
      log.write('write', { kind, hex: b.toString('hex') });
      try {
        await port.write(kind, b);
      } catch (e) {
        log.write('write-failed', { kind, reason: reason(e) });
        throw e;
      }
    },
    onDisconnect: (cb) => port.onDisconnect((kind) => { log.write('lost', { kind }); cb(kind); }),
    onControl: (cb) => port.onControl((b) => { log.write('control', { hex: b.toString('hex') }); cb(b); }),
    ...(port.deviceName ? { deviceName: (kind: DeviceKind) => port.deviceName!(kind) } : {}),
  };
};
