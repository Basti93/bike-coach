import { useEffect, useRef } from 'react';
import type { Profile } from '../shared/profiles';
import type { ClientMessage } from '../shared/protocol';

/** The fields the server owns. Every other local field stays as it is. */
const OWNED = ['ftpW', 'maxHrBpm', 'hrMaxBpm', 'weightKg', 'heightCm', 'birthDate', 'sex', 'name', 'avatar'] as const;

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

/**
 * A moved profile's values live on the server; the ride service gets them so a ride uses the server's FTP.
 * Sent only when a value differs, never while a ride is open, and once per server state.
 */
export const useServerProfile = (local: Profile | null, server: Profile | null, riding: boolean, sendRide: (m: ClientMessage) => void): void => {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!server) { sent.current = null; return; }
    if (!local || local.id !== server.id || riding) return;
    const key = JSON.stringify(server);
    if (sent.current === key) return;
    const next = withServerValues(local, server);
    if (!next) return;
    sent.current = key;
    sendRide({ type: 'save-profile', profile: next });
  }, [local, server, riding, sendRide]);
};
