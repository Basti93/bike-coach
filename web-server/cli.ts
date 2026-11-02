import { pathToFileURL } from 'node:url';
import { createAccount, listDevices, revokeDevice, setPassword } from './auth';
import { openDb } from './db';

export type Io = { readPassword: () => Promise<string>; out: (s: string) => void };

const flag = (args: string[], name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

export const run = async (args: string[], dbPath: string, io: Io): Promise<number> => {
  const db = openDb(dbPath);
  const [cmd] = args;
  try {
    if (cmd === 'create-account' || cmd === 'set-password') {
      const name = flag(args, '--name');
      if (!name) throw new Error(`${cmd} needs --name <name>`);
      const pw = await io.readPassword();
      if (cmd === 'create-account') { await createAccount(db, name, pw, { force: args.includes('--force') }); io.out('account created'); }
      else { await setPassword(db, name, pw); io.out('password changed; sessions ended, device tokens revoked, login attempts cleared'); }
    } else if (cmd === 'list-devices') {
      for (const d of listDevices(db)) io.out(`${d.id}\t${d.account}\t${d.name}\t${d.revoked ? 'revoked' : 'active'}`);
    } else if (cmd === 'revoke-device') {
      const id = Number(flag(args, '--id'));
      if (!Number.isInteger(id) || !revokeDevice(db, id)) throw new Error('no such device');
      io.out('device revoked');
    } else throw new Error('commands: create-account --name <n> [--force], set-password --name <n>, list-devices, revoke-device --id <id>');
    return 0;
  } catch (e) {
    io.out(`error: ${(e as Error).message}`);
    return 1;
  } finally {
    db.close();
  }
};

/** Without echo on a terminal; from a pipe, the first line. */
export const readPasswordFromStdin = async (): Promise<string> => {
  const stdin = process.stdin;
  if (stdin.isTTY) {
    process.stderr.write('Password: ');
    return new Promise((res) => {
      let pw = '';
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      const onData = (c: string) => {
        for (const ch of c) {
          if (ch === '\r' || ch === '\n' || ch === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stderr.write('\n'); return res(pw); }
          if (ch === '\u0003') process.exit(130);
          if (ch === '\u007f') pw = pw.slice(0, -1); else pw += ch;
        }
      };
      stdin.on('data', onData);
    });
  }
  let s = '';
  for await (const c of stdin) s += c;
  return s.split(/\r?\n/)[0] ?? '';
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2), process.env.PANDAFIT_DB ?? 'pandafit.db', { readPassword: readPasswordFromStdin, out: (s) => console.log(s) }).then((c) => process.exit(c));
}
