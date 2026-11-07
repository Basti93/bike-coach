import type { TrackedRecord } from './records';
import { above, titleHash } from './exercise-links';

export type CoachId = 'bike' | 'gym' | 'run';
export type TaskFrom = CoachId | 'chat';
export const COACH_IDS: readonly CoachId[] = ['bike', 'gym', 'run'];
export const TASK_MAX_TEXT = 300;
/** A one-off task is meant for the next sessions; a lasting one is a wish that holds for a while. */
export const ONE_OFF_MS = 7 * 86_400_000;
export const LASTING_MS = 60 * 86_400_000;

/** A request handed to a coach, by the person through the week chat or by another coach. `doneMs`: set when it was dealt with. */
export type CoachTask = { from: TaskFrom; to: CoachId; text: string; lasting: boolean; atMs: number; doneMs?: number };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const FROMS: readonly string[] = ['chat', ...COACH_IDS];

/** The same request (from, to, text, time) is the same record on every Mac, so a migration or a second answer adds nothing. */
export const taskId = (t: Pick<CoachTask, 'from' | 'to' | 'text' | 'atMs'>): string => `task-${titleHash(`${t.from}\n${t.to}\n${t.text}\n${t.atMs}`)}`;

/** The body of a `task` record, or null for anything else. */
export function readTask(body: unknown): CoachTask | null {
  if (!isObj(body) || !FROMS.includes(body.from as string) || !COACH_IDS.includes(body.to as CoachId)) return null;
  if (typeof body.text !== 'string' || !body.text.trim() || typeof body.lasting !== 'boolean') return null;
  if (typeof body.atMs !== 'number' || !Number.isFinite(body.atMs)) return null;
  if (body.doneMs !== undefined && (typeof body.doneMs !== 'number' || !Number.isFinite(body.doneMs))) return null;
  return { from: body.from as TaskFrom, to: body.to as CoachId, text: body.text, lasting: body.lasting, atMs: body.atMs, ...(body.doneMs !== undefined ? { doneMs: body.doneMs as number } : {}) };
}

/** Migrated records are stamped 1, so any later person edit (remove) wins over a migration run on another Mac. */
export const taskRecord = (t: CoachTask, nowMs: number, migrated = false): TrackedRecord =>
  ({ kind: 'task', id: taskId(t), updatedMs: migrated ? 1 : nowMs, deleted: false, body: { ...t } });

/** The tombstone for a task (remove). */
export const deleteTask = (r: TrackedRecord, nowMs: number): TrackedRecord => ({ ...r, deleted: true, updatedMs: above(nowMs, r) });

export const taskAlive = (t: CoachTask, nowMs: number): boolean => nowMs - t.atMs <= (t.lasting ? LASTING_MS : ONE_OFF_MS);

/** The live, readable, unexpired, undone tasks, oldest first. */
export const openTasks = (records: readonly TrackedRecord[], nowMs: number): (CoachTask & { id: string })[] =>
  records.flatMap((r) => { const t = r.kind === 'task' && !r.deleted ? readTask(r.body) : null; return t && t.doneMs === undefined && taskAlive(t, nowMs) ? [{ ...t, id: r.id }] : []; })
    .sort((a, b) => a.atMs - b.atMs || (a.id < b.id ? -1 : 1));

export const TASK_FROM_LABEL: Record<TaskFrom, string> = { chat: 'Person über den Wochenchat', bike: 'Rad-Coach', gym: 'Kraft-Coach', run: 'Lauf-Coach' };
export const COACH_LABEL: Record<CoachId, string> = { bike: 'Rad-Coach', gym: 'Kraft-Coach', run: 'Lauf-Coach' };
