import fs from 'node:fs';
import { AccountLinks, LinkError, type RecordLinks } from '../tracking/link';

/** How long the records sync waits after the api refused the internal token, e.g. during an api redeploy. */
export const REJECT_RETRY_MS = 30 * 60_000;

/**
 * The server coach's records link for one account: always linked, to the api's internal records routes, with the internal token.
 * Only the account's own profile id gets an answer. Linking and unlinking are not things a server account does.
 */
export const internalLinks = (opts: { apiUrl: string; token: string; accountId: number; profileId: string; dir: string; nowMs?: () => number }): RecordLinks => {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const url = `${opts.apiUrl.replace(/\/+$/, '')}/internal/accounts/${opts.accountId}`;
  const own = (profileId: string): boolean => profileId === opts.profileId;
  // The cursor files keep the Mac's format and code.
  const cursorFiles = new AccountLinks({ dir: opts.dir });
  let rejectedAtMs: number | null = null;
  /** Refused by the api a short while ago; after REJECT_RETRY_MS the sync tries again. */
  const rejected = (): boolean => {
    if (rejectedAtMs !== null && nowMs() - rejectedAtMs >= REJECT_RETRY_MS) rejectedAtMs = null;
    return rejectedAtMs !== null;
  };
  return {
    link: async () => { throw new LinkError('failed'); },
    unlink: () => {},
    status: (profileId) => (own(profileId) ? { state: rejected() ? 'rejected' : 'linked', name: null } : { state: 'idle', name: null }),
    // For the records sync only: never part of a status, a log or a prompt. Null for a while after the api refused it.
    token: (profileId) => (own(profileId) && !rejected() ? opts.token : null),
    url: (profileId) => (own(profileId) ? url : null),
    reject: (profileId) => {
      if (!own(profileId)) return;
      if (rejectedAtMs === null) console.error(`Konto ${opts.accountId}: die api lehnt den internen Records-Abgleich ab, neuer Versuch in ${REJECT_RETRY_MS / 60_000} Minuten`);
      rejectedAtMs = nowMs();
    },
    cursors: (profileId) => {
      if (!own(profileId)) throw new Error('Ungültiges Profil');
      fs.mkdirSync(opts.dir, { recursive: true, mode: 0o700 });
      return cursorFiles.cursors(profileId);
    },
  };
};
