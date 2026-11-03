import type { TrackedRecord } from './records';
import { parseProposal, type WeekProposal } from './week-plan';

/**
 * One chat thread per profile, one `chat` record per message. The rider's messages are written by any of their devices,
 * the coach's only by the side that coaches the profile. `replyTo` ties a coach answer to the rider message it answers;
 * `takes`/`declines` mark the rider's answer to a proposal (no coach reply follows those).
 */
export type ChatMessage = {
  role: 'rider' | 'coach';
  text: string;
  atMs: number;
  replyTo?: string;
  proposal?: WeekProposal;
  /** Rules the proposal breaks because the rider asked for it; shown once, applied only on "Übernehmen". */
  warnings?: string[];
  takes?: string;
  declines?: string;
  /** The coach could not answer (no Claude, limit); the rider may write again. */
  failed?: boolean;
};
export type ChatEntry = ChatMessage & { id: string };

/** Kept this long; older messages are deleted by the coach side. */
export const CHAT_KEEP_MS = 90 * 86_400_000;
/** The coach sees this many of the latest messages. */
export const CHAT_CONTEXT = 30;
export const MAX_CHAT_TEXT = 2000;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');

export function readChat(x: unknown): ChatMessage | null {
  if (!isObj(x) || (x.role !== 'rider' && x.role !== 'coach') || typeof x.text !== 'string' || typeof x.atMs !== 'number' || !Number.isFinite(x.atMs)) return null;
  const m: ChatMessage = { role: x.role, text: x.text.slice(0, MAX_CHAT_TEXT), atMs: x.atMs };
  if (typeof x.replyTo === 'string') m.replyTo = x.replyTo;
  if (typeof x.takes === 'string') m.takes = x.takes;
  if (typeof x.declines === 'string') m.declines = x.declines;
  if (x.failed === true) m.failed = true;
  if (x.proposal !== undefined) { const p = parseProposal(x.proposal); if (!p) return null; m.proposal = p; }
  if (x.warnings !== undefined) { if (!strings(x.warnings)) return null; m.warnings = x.warnings; }
  return m;
}

/** The thread, oldest first, unreadable and deleted records skipped. */
export const chatThread = (records: TrackedRecord[]): ChatEntry[] =>
  records.flatMap((r) => { if (r.kind !== 'chat' || r.deleted) return []; const m = readChat(r.body); return m ? [{ ...m, id: r.id }] : []; })
    .sort((a, b) => a.atMs - b.atMs || (a.id < b.id ? -1 : 1));

/** The rider message still waiting for the coach: the latest rider message that is not a take or decline and has no answer. */
export function waitingMessage(thread: ChatEntry[]): ChatEntry | null {
  const answered = new Set(thread.filter((m) => m.role === 'coach' && m.replyTo).map((m) => m.replyTo));
  for (let i = thread.length - 1; i >= 0; i--) {
    const m = thread[i]!;
    if (m.role === 'coach') return null;
    if (m.takes || m.declines) continue;
    return answered.has(m.id) ? null : m;
  }
  return null;
}

/** Whether the rider already took or declined a proposal. */
export const proposalAnswer = (thread: ChatEntry[], id: string): 'taken' | 'declined' | null => {
  for (const m of thread) { if (m.takes === id) return 'taken'; if (m.declines === id) return 'declined'; }
  return null;
};
