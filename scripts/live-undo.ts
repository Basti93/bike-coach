import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Reverts the latest commit with the prefix "live:" using git revert. */
export const undoLastLive = (repo: string, gitArgs: string[] = []): string => {
  const git = (...a: string[]) => execFileSync('git', [...gitArgs, '-C', repo, ...a], { stdio: 'pipe' }).toString().trim();
  const hash = git('log', '--grep=^live:', '-n', '1', '--format=%H');
  if (!hash) throw new Error('Kein Commit mit Präfix live: gefunden.');
  git('revert', '--no-edit', hash);
  return hash;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`Rückgängig: ${undoLastLive(process.cwd())}\n`);
}
