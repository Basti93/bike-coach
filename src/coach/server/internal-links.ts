import fs from 'node:fs';
import { AccountLinks, LinkError, type RecordLinks } from '../tracking/link';

/**
 * The server coach's records link for one account: always linked, to the api's internal records routes, with the internal token.
 * Only the account's own profile id gets an answer. Linking and unlinking are not things a server account does.
 */
export const internalLinks = (opts: { apiUrl: string; token: string; accountId: number; profileId: string; dir: string }): RecordLinks => {
  const url = `${opts.apiUrl.replace(/\/+$/, '')}/internal/accounts/${opts.accountId}`;
  const own = (profileId: string): boolean => profileId === opts.profileId;
  // The cursor files keep the Mac's format and code.
  const cursorFiles = new AccountLinks({ dir: opts.dir });
  let rejected = false;
  return {
    link: async () => { throw new LinkError('failed'); },
    unlink: () => {},
    status: (profileId) => (own(profileId) ? { state: rejected ? 'rejected' : 'linked', name: null } : { state: 'idle', name: null }),
    // For the records sync only: never part of a status, a log or a prompt. Null once the api refused it, until the coach restarts.
    token: (profileId) => (own(profileId) && !rejected ? opts.token : null),
    url: (profileId) => (own(profileId) ? url : null),
    reject: (profileId) => { if (own(profileId)) rejected = true; },
    cursors: (profileId) => {
      if (!own(profileId)) throw new Error('Ungültiges Profil');
      fs.mkdirSync(opts.dir, { recursive: true, mode: 0o700 });
      return cursorFiles.cursors(profileId);
    },
  };
};
