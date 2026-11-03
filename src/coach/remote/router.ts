import type { CoachClientMessage, CoachServerMessage, CoachStateMessage } from '../../shared/coach-protocol';
import type { CoachRuntime } from '../runtime';
import { clearMoved } from './home';
import type { RemoteCoach } from './remote-coach';

/** How long a request to the server waits for its answer before the interface gets the empty one. */
const ANSWER_MS = 60_000;

export type RouterOptions = {
  local: CoachRuntime;
  /** The server coach of a moved profile, or null for a profile coached here. */
  remote: (profileId: string) => RemoteCoach | null;
  /** True while someone in the meal plan is still coached here: the meal plan stays local for everyone. */
  mealsLocal: () => boolean;
  /** The local runtime's `coach` folder, where the moved marker lives. */
  coachDir: string;
  /** Default: setTimeout. For tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
};

type Pending = { reply: (m: CoachServerMessage) => void; done: boolean };
/** Requests whose answer the interface waits for, by the type of the answer. */
const ANSWERS: Partial<Record<CoachClientMessage['type'], CoachServerMessage['type']>> = {
  'gym-preview': 'gym-preview', 'gym-confirm': 'gym-confirm-result', 'garmin-health': 'garmin-health', 'ride-detail': 'ride-detail',
};
/** The answer the interface gets at once when the server cannot be asked, so it never waits for nothing. */
const EMPTY: Partial<Record<CoachServerMessage['type'], CoachServerMessage>> = {
  'gym-preview': { type: 'gym-preview', preview: null },
  'gym-confirm-result': { type: 'gym-confirm-result', result: 'failed' },
};

/**
 * Sends a profile's coach messages where its coach runs: the local runtime, or the server for a moved profile. Records and
 * the account link always stay local, and the meal plan stays local while anyone in it is still coached here.
 */
export const createRouter = (opts: RouterOptions) => {
  const { local } = opts;
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => { const t = setTimeout(fn, ms); t.unref?.(); return t; });
  /** Per profile and answer type: who waits, oldest first. The server answers a socket's requests in order. */
  const waiting = new Map<string, Pending[]>();
  const keyOf = (profileId: string, type: string) => `${profileId}\u0000${type}`;

  const remoteOf = (profileId: string): RemoteCoach | null => { try { return opts.remote(profileId); } catch { return null; } };
  const mealsLocal = (): boolean => { try { return opts.mealsLocal(); } catch { return true; } };

  const view = (profileId: string): CoachStateMessage | null => {
    const remote = remoteOf(profileId);
    if (!remote) return local.view(profileId);
    const v = remote.view();
    // The link is this Mac's: its status comes from the local account sync, not from the server's own link.
    let account = v.account;
    try { account = local.accountSync.status(profileId); } catch { /* the server's then */ }
    const out: CoachStateMessage = { ...v, ...(account ? { account } : {}) };
    if (mealsLocal()) out.meals = local.mealsView(profileId);
    return out;
  };

  const handle = (m: CoachClientMessage, reply: (msg: CoachServerMessage) => void): void => {
    const send = (msg: CoachServerMessage) => { try { reply(msg); } catch { /* connection gone */ } };
    try {
      const profileId = (m as { profileId?: unknown }).profileId;
      const remote = typeof profileId === 'string' ? remoteOf(profileId) : null;
      // Records sync through the account sync as before, and the link is this Mac's.
      if (!remote || m.type === 'records-put' || m.type === 'records-list' || m.type === 'account-link') { local.handle(m, reply); return; }
      const id = profileId as string;
      // Back to the local coach, whose view goes out at once.
      if (m.type === 'account-unlink') { clearMoved(opts.coachDir, id); local.handle(m, reply); local.handle({ type: 'subscribe', profileId: id }, reply); return; }
      if (m.type === 'subscribe') { const v = view(id); if (v) send(v); return; }
      if (m.type.startsWith('meals-') && mealsLocal()) { local.handle(m, reply); return; }
      const answer = ANSWERS[m.type];
      const result = remote.send(m);
      if (!answer) return;
      if (result !== 'sent') { const empty = EMPTY[answer]; if (empty) send(empty); return; }
      const key = keyOf(id, answer);
      const p: Pending = { reply: send, done: false };
      waiting.set(key, [...(waiting.get(key) ?? []), p]);
      setTimer(() => {
        if (p.done) return;
        p.done = true;
        waiting.set(key, (waiting.get(key) ?? []).filter((x) => x !== p));
        const empty = EMPTY[answer];
        if (empty) send(empty);
      }, ANSWER_MS);
    } catch { /* ignore invalid message */ }
  };

  /** An answer from a profile's server coach to a request made through handle. False when nobody waits for it. */
  const answered = (profileId: string, m: CoachServerMessage): boolean => {
    const key = keyOf(profileId, m.type);
    const list = waiting.get(key) ?? [];
    const p = list.shift();
    if (list.length === 0) waiting.delete(key);
    if (!p) return false;
    p.done = true;
    p.reply(m);
    return true;
  };

  return { handle, view, answered };
};
export type CoachRouter = ReturnType<typeof createRouter>;

/** The meal plan stays local while anyone in it (meals turned on) is still coached here. */
export const mealsStayLocal = (profileIds: string[], inMealPlan: (id: string) => boolean, onServer: (id: string) => boolean): boolean =>
  profileIds.some((id) => { try { return inMealPlan(id) && !onServer(id); } catch { return false; } });
