import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';

/** A WebSocket as RemoteCoach uses it, driven by the test. No network. */
export class FakeSocket extends EventEmitter {
  sent: Record<string, unknown>[] = [];
  closed: number | null = null;
  constructor(readonly url: string, readonly options: { headers?: Record<string, string> }) { super(); }
  send(data: string): void {
    if (this.closed !== null) throw new Error('closed');
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code = 1000): void { this.end(code); }
  terminate(): void { this.end(1006); }

  // ---- the server's side ----
  open(): void { this.emit('open'); }
  answer(m: unknown): void { this.emit('message', Buffer.from(JSON.stringify(m)), false); }
  end(code: number): void {
    if (this.closed !== null) return;
    this.closed = code;
    this.emit('close', code, Buffer.from(''));
  }
  /** The api refuses the upgrade, e.g. 401 for a refused login. */
  refuse(status: number): void { this.emit('unexpected-response', {}, { statusCode: status, resume() {} }); }
  types(): string[] { return this.sent.map((m) => String(m.type)); }
}

export const fakeSockets = () => {
  const sockets: FakeSocket[] = [];
  class Impl extends FakeSocket {
    constructor(url: string, options: { headers?: Record<string, string> }) { super(url, options); sockets.push(this); }
  }
  return { sockets, Impl: Impl as unknown as typeof WebSocket, last: () => sockets[sockets.length - 1]! };
};
