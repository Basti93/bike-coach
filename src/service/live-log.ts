import fs from 'node:fs';
import path from 'node:path';

/** Running stream for Claude Code. Errors here must never touch the ride. */
export class LiveLog {
  private file: string;
  constructor(dir: string) { this.file = path.join(dir, 'live', 'current.jsonl'); }
  reset(): void {
    try { fs.rmSync(this.file, { force: true }); } catch { /* deliberately ignored */ }
  }
  write(line: object): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(line)}\n`);
    } catch { /* deliberately ignored */ }
  }
}
