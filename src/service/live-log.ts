import fs from 'node:fs';
import path from 'node:path';

/** Laufender Strom für Claude Code. Fehler hier dürfen die Fahrt nie berühren. */
export class LiveLog {
  private file: string;
  constructor(dir: string) { this.file = path.join(dir, 'live', 'current.jsonl'); }
  write(line: object): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(line)}\n`);
    } catch { /* bewusst ignoriert */ }
  }
}
