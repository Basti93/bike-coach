import { useEffect, useRef } from 'react';
import type { Profile } from '../shared/profiles';
import type { ClientMessage } from '../shared/protocol';

/** The fields the server owns. Every other local field stays as it is. */
const OWNED = ['ftpW', 'maxHrBpm', 'hrMaxBpm', 'weightKg', 'heightCm', 'birthDate', 'sex', 'name', 'avatar', 'ftpCapW'] as const;

/** The local profile with the server's values; null when nothing differs. */
export const withServerValues = (local: Profile, server: Profile): Profile | null => {
  const next: Profile = { ...local };
  let changed = false;
  for (const key of OWNED) {
    if (local[key] === server[key]) continue;
    changed = true;
    if (server[key] === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = server[key];
  }
  return changed ? next : null;
};

const EDIT_WAIT_MS = 30_000;
export type PendingEdit = { profile: Profile; atMs: number };

/**
 * After a local edit, coach-state profiles older than the edit are skipped until one reflects it, or for 30 s.
 */
export const settleServerProfile = (pending: PendingEdit | null, incoming: Profile, nowMs: number): { accept: boolean; pending: PendingEdit | null } => {
  if (!pending) return { accept: true, pending: null };
  if (nowMs - pending.atMs >= EDIT_WAIT_MS || withServerValues(pending.profile, incoming) === null) return { accept: true, pending: null };
  return { accept: false, pending };
};

/**
 * A moved profile's values live on the server; the ride service gets them so a ride uses the server's FTP.
 * Sent only when a value differs, never while a ride is open, and once per server state.
 */
export const useServerProfile = (local: Profile | null, server: Profile | null, riding: boolean, sendRide: (m: ClientMessage) => void | boolean, known = true): void => {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!server) { sent.current = null; return; }
    if (!local || local.id !== server.id || riding || !known) return;
    const key = JSON.stringify(server);
    if (sent.current === key) return;
    const next = withServerValues(local, server);
    if (!next) return;
    if (sendRide({ type: 'save-profile', profile: next }) !== false) sent.current = key;
  }, [local, server, riding, sendRide, known]);
};
