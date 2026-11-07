import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

/**
 * The api image copies only web-server/*.ts and a few files of src/shared. Every src/shared module the server imports (also
 * through other shared modules) must be copied, or the server or its CLI cannot start in the container.
 */
const root = join(__dirname, '..', '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

/** Relative value imports (not `import type`) of a file, as repo paths with `.ts`. */
function imports(file: string): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(/^import\s+(?!type\b)[^'"]*from\s+'(\.[^']+)'/gm)) {
    out.push(normalize(join(dirname(file), m[1]!)) + '.ts');
  }
  return out;
}

describe('api image', () => {
  it('copies every src/shared module the server needs', () => {
    const docker = read('web-server/Dockerfile');
    const copied = new Set<string>(['src/shared/records.ts']);
    for (const m of docker.matchAll(/^COPY\s+((?:src\/shared\/\S+\s+)+)\.\/src\/shared\//gm)) for (const f of m[1]!.trim().split(/\s+/)) copied.add(f);
    const todo = readdirSync(join(root, 'web-server')).filter((f) => f.endsWith('.ts')).map((f) => `web-server/${f}`);
    const needed = new Set<string>();
    while (todo.length) {
      const f = todo.pop()!;
      for (const i of imports(f)) {
        const p = relative(root, join(root, i));
        if (!p.startsWith('src/shared/') || needed.has(p)) continue;
        needed.add(p);
        todo.push(p);
      }
    }
    expect([...needed].filter((p) => !copied.has(p))).toEqual([]);
  });
});
