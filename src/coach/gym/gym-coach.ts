import { ClaudeError } from '../claude-client';
import type { StrengthWorkout } from '../hevy';
import type { RideSummary } from '../metrics';
import { complaintFromNote, type Complaint } from '../motivation';
import { checkWorkout, WIDOWMAKER_REPS, type GymContext } from './guardrails';
import { HevyError, type HevyRoutines } from './hevy-routines';
import { LONG_BREAK_DAYS, MAX_SETS, REP_MAX, REP_MIN } from './limits';
import { buildGymPrompt, gymAnswerJsonSchema, gymAnswerSchema, GYM_SYSTEM_PROMPT, honestFigures, NEUTRAL_REASON, type GymAnswer } from './prompt';
import { ruleWorkout } from './rules';
import { loadGymState, removeGymState, saveGymState, type GymState } from './state';
import type { ExerciseTemplate, GymExercise, GymWorkout } from './types';

const DAY_MS = 86_400_000;
const RETRY_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const MAX_RULES = 20;
const MAX_NOTES = 20;
const MAX_ANSWERS = 20;
const MAX_QUESTIONS = 2;
const TEXT_MAX = 400;
const QUESTION_MAX = 200;
const NAME_MAX = 80;
const GYM_QUESTION = 'Trainierst du noch im selben Studio, mit denselben Geräten?';
const LEG_COMPLAINT = /knie|hüfte|huefte|oberschenkel|wade|knöchel|knoechel|fuß|fuss|achilles|bein/i;
const COMPLAINT_HINT = 'Deine gemeldete Beschwerde habe ich so weit berücksichtigt, wie Regeln das können. Lass einfach weg, was dich stört.';
const BREAK_NOTE = 'Nach der Pause fange ich ruhig an und taste mich wieder heran.';

type Ask = (input: { prompt: string; systemPrompt: string; schema: object }) => Promise<unknown>;
type Deps = {
  dir: string; ask: Ask; nowMs: () => number;
  workouts: (id: string) => StrengthWorkout[];
  templates: (id: string) => Promise<ExerciseTemplate[]>;
  /** Fetches past the template cache. Only reads from Hevy. */
  refreshTemplates: (id: string) => Promise<ExerciseTemplate[]>;
  ready: (id: string) => boolean;
  bike: (id: string) => { summaries: RideSummary[]; complaints: Complaint[] };
  complaint: (id: string, text: string) => void;
  /** Null without a Hevy key. This is the only path to a Hevy write, and only `confirm` uses it. */
  writer: (id: string) => HevyRoutines | null;
};

/** Hevy refuses what we sent, so the stored workout cannot be written. Auth, limits, its own trouble and the network are no such answer. */
const refusedByHevy = (e: unknown): boolean => e instanceof HevyError && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status);
/** Older stored records lack the sets until the next sync has replaced them. The coach skips such a record until then. */
const hasSetDetails = (w: StrengthWorkout): boolean => Array.isArray(w.exercises) && w.exercises.every((e) => Array.isArray(e.workSets));
const complaintsFingerprint = (open: Complaint[]): string => open.map((c) => `${c.id}:${c.status}`).sort().join(',');
const fingerprint = (w: GymWorkout): string => JSON.stringify(w);
const isWidowmaker = (e: GymExercise): boolean => /^\s*widowmaker\b/i.test(e.notes);
const isWidowSet = (e: GymExercise, i: number): boolean => isWidowmaker(e) && e.sets[i].reps === WIDOWMAKER_REPS && !e.sets[i].repRange;
const clean = (text: string | undefined, max: number): string | null => {
  const t = (text ?? '').trim();
  return t ? t.slice(0, max) : null;
};

/**
 * The strength coach. It plans from the rider's Hevy history and only writes to Hevy in `confirm`, after a `preview`.
 * It reacts to real workouts, notes and changed open complaints: bike rides and the bike plan never trigger a replan.
 */
export class GymCoach {
  private states = new Map<string, GymState>();
  private running = new Map<string, Promise<void>>();
  private previews = new Map<string, { fp: string; edited: boolean }>();
  private writing = new Set<string>();
  private generation = new Map<string, number>();

  constructor(private deps: Deps) {}

  state(id: string): GymState {
    let s = this.states.get(id);
    if (!s) { s = loadGymState(this.deps.dir, id); this.states.set(id, s); }
    return s;
  }
  isThinking(id: string): boolean { return this.running.has(id); }

  private update(id: string, fn: (s: GymState) => void): void {
    const s = this.state(id);
    fn(s);
    saveGymState(this.deps.dir, s);
  }
  private gen(id: string): number { return this.generation.get(id) ?? 0; }
  /** Drops the change when `forget` ran since the work began. */
  private updateIf(gen: number, id: string, fn: (s: GymState) => void): void {
    if (this.gen(id) === gen) this.update(id, fn);
  }

  tick(id: string): Promise<void> {
    const active = this.running.get(id);
    if (active) return active;
    const run: Promise<void> = this.plan(id).finally(() => { if (this.running.get(id) === run) this.running.delete(id); });
    this.running.set(id, run);
    return run;
  }

  private async plan(id: string): Promise<void> {
    if (!this.deps.ready(id)) return;
    const now = this.deps.nowMs();
    const real = this.deps.workouts(id).filter((w) => w.startMs <= now && hasSetDetails(w));
    this.askAboutGym(id, real, now);
    const s = this.state(id);
    const open = this.deps.bike(id).complaints.filter((c) => c.status !== 'over');
    const used = complaintsFingerprint(open);
    // Stored right away, so a failing plan retries through dirty and the attempts limit, not through this.
    if (used !== s.complaintsFingerprint) this.update(id, (x) => { x.complaintsFingerprint = used; x.dirty = true; x.attempts = 0; });
    const seen = new Set(s.seenWorkoutIds);
    const unseen = real.filter((w) => !seen.has(w.id));
    if (s.planned && !s.dirty && unseen.length === 0) return;
    const newest = (list: StrengthWorkout[]) => list.reduce<StrengthWorkout | null>((a, w) => (!a || w.startMs > a.startMs ? w : a), null);
    const key = (newest(unseen) ?? newest(real))?.id ?? 'none';
    if (s.attemptKey !== key) this.update(id, (x) => { x.attemptKey = key; x.attempts = 0; });
    if (s.attempts > 0 && (s.attempts >= MAX_ATTEMPTS || (s.lastAttemptMs !== null && now - s.lastAttemptMs < RETRY_MS))) return;
    if (s.templatesFailedMs !== null && now - s.templatesFailedMs < RETRY_MS) return;
    this.update(id, (x) => { x.dirty = true; });
    const latest = newest(real);
    // Old workouts surfacing during a break get no feedback, which would also replace the note about the break.
    const onBreak = latest !== null && now - latest.startMs > LONG_BREAK_DAYS * DAY_MS;
    const wantNote = s.planned && unseen.length > 0 && !onBreak;
    const previous = s.next;
    const gen = this.gen(id);
    let templates: ExerciseTemplate[];
    try {
      templates = await this.deps.templates(id);
    } catch {
      this.updateIf(gen, id, (x) => { x.lastError = 'failed'; x.templatesFailedMs = now; });
      return;
    }
    this.updateIf(gen, id, (x) => { x.templatesFailedMs = null; x.attempts += 1; x.lastAttemptMs = now; });
    try {
      const ids = new Set(templates.map((t) => t.id));
      if (real.some((w) => w.exercises.some((e) => e.templateId && !ids.has(e.templateId)))) {
        // Once per plan. A failure keeps what is known; such exercises are left out.
        try { templates = await this.deps.refreshTemplates(id); } catch { /* keep the known list */ }
      }
      const ctx: GymContext = { workouts: real, templates, nowMs: now, ...(open.some((c) => LEG_COMPLAINT.test(c.text)) ? { avoidLegs: true } : {}) };
      const rule = ruleWorkout(ctx);
      if (open.length > 0 && rule.workout.exercises.length > 0) rule.reason = `${rule.reason} ${COMPLAINT_HINT}`;
      const hasRule = rule.workout.exercises.length > 0;
      // An empty rule workout is never stored as an offer; only its reason is kept.
      this.updateIf(gen, id, (x) => {
        x.next = hasRule ? { workout: rule.workout, reason: rule.reason, source: 'rules' } : null;
        x.emptyReason = hasRule ? null : rule.reason;
      });
      const ask = (rejection?: string) => this.deps.ask({
        prompt: buildGymPrompt({ state: this.state(id), workouts: real, templates, nowMs: now, ...this.deps.bike(id), previous, wantNote, rejection }),
        systemPrompt: GYM_SYSTEM_PROMPT, schema: gymAnswerJsonSchema,
      });
      let raw = await ask();
      const rejected = this.rejection(raw, ctx);
      if (rejected) {
        // Exactly one second attempt with the reason, after that the rules take over.
        try { raw = await ask(rejected); } catch { /* The first answer decides. */ }
      }
      const parsed = gymAnswerSchema.safeParse(raw);
      const checked = parsed.success ? checkWorkout(parsed.data.workout, ctx) : null;
      this.updateIf(gen, id, (x) => {
        if (parsed.success && checked?.ok) this.applyAnswer(x, parsed.data, checked.workout, real, wantNote, now);
        else x.lastError = 'invalid';
        x.dirty = false; x.planned = true; x.attempts = 0;
        x.seenWorkoutIds = real.map((w) => w.id);
      });
    } catch (e) {
      this.updateIf(gen, id, (x) => { x.lastError = e instanceof ClaudeError ? e.kind : 'failed'; x.dirty = true; });
    }
  }

  private rejection(raw: unknown, ctx: GymContext): string | null {
    const parsed = gymAnswerSchema.safeParse(raw);
    if (!parsed.success) return 'Die Antwort passte nicht zum Schema.';
    const checked = checkWorkout(parsed.data.workout, ctx);
    return checked.ok ? null : checked.reason;
  }

  private applyAnswer(s: GymState, a: GymAnswer, workout: GymWorkout, real: StrengthWorkout[], wantNote: boolean, now: number): void {
    const honest = (text: string) => honestFigures(text, figures(real, workout));
    const fallback = s.next?.source === 'rules' ? s.next.reason : NEUTRAL_REASON;
    const reason = clean(a.reason, TEXT_MAX);
    s.next = { workout, reason: (reason && honest(reason)) || fallback, source: 'claude' };
    s.emptyReason = null;
    s.lastError = null;
    const rule = clean(a.newRule, 200);
    if (rule && honest(rule) && !s.rules.some((r) => r.text === rule)) s.rules = [...s.rules, { atMs: now, text: rule }].slice(-MAX_RULES);
    if (!wantNote) return;
    const text = clean(a.note, TEXT_MAX);
    const newest = real.reduce((m, w) => (w.startMs > m.startMs ? w : m), real[0]);
    const checkedText = text && honest(text);
    s.lastNote = checkedText ? {
      workoutId: newest.id, text: checkedText, atMs: now,
      questions: (a.questions ?? []).flatMap((q) => { const c = clean(q, QUESTION_MAX); return c && honest(c) ? [c] : []; }).slice(0, MAX_QUESTIONS),
    } : null;
  }

  /** After a long break the coach asks once whether the gym is still the same, and rebuilds the plan with stepped-back weights. */
  private askAboutGym(id: string, real: StrengthWorkout[], now: number): void {
    const s = this.state(id);
    if (real.length === 0) return;
    const newest = real.reduce((m, w) => (w.startMs > m.startMs ? w : m), real[0]);
    if (now - newest.startMs <= LONG_BREAK_DAYS * DAY_MS) {
      if (s.gymAsked) this.update(id, (x) => { x.gymAsked = false; });
      return;
    }
    if (s.gymAsked) return;
    this.update(id, (x) => { x.gymAsked = true; x.dirty = true; x.attempts = 0; x.lastNote = { workoutId: newest.id, text: BREAK_NOTE, questions: [GYM_QUESTION], atMs: now }; });
  }

  adjust(id: string, how: 'easier' | 'harder' | 'shorter'): void {
    const next = this.state(id).next;
    if (!next || next.workout.exercises.length === 0) return;
    if (how !== 'easier' && how !== 'harder' && how !== 'shorter') return;
    const w = structuredClone(next.workout);
    if (how === 'easier') {
      for (const e of w.exercises) {
        const work = e.sets.map((_, i) => i).filter((i) => e.sets[i].type !== 'warmup' && !isWidowSet(e, i));
        if (work.length > 1) e.sets.splice(work[work.length - 1], 1);
      }
    } else if (how === 'harder') {
      for (const e of w.exercises) {
        if (w.exercises.reduce((n, x) => n + x.sets.length, 0) >= MAX_SETS) break;
        const last = e.sets.map((s, i) => ({ s, i })).filter(({ s, i }) => s.type === 'normal' && !isWidowSet(e, i)).pop();
        if (last && !isWidowmaker(e)) e.sets.push({ ...last.s });
      }
    } else if (how === 'shorter') {
      if (w.exercises.length <= 1) return;
      w.exercises.splice(w.exercises.length - Math.ceil(w.exercises.length / 3));
      const ids = w.exercises.map((e) => e.supersetId).filter((v): v is number => v !== null);
      for (const e of w.exercises) if (e.supersetId !== null && ids.filter((v) => v === e.supersetId).length < 2) e.supersetId = null;
    }
    this.update(id, (s) => { s.next = { ...next, workout: w }; });
  }

  note(id: string, text: string): void {
    this.update(id, (s) => {
      const now = this.deps.nowMs();
      s.notes = [...s.notes, { atMs: now, text: text.slice(0, 300) }].slice(-MAX_NOTES);
      this.keepComplaint(id, s, text, now);
      s.dirty = true; s.attempts = 0;
    });
  }

  answer(id: string, question: string, text: string): void {
    this.update(id, (s) => {
      const now = this.deps.nowMs();
      s.answers = [...s.answers, { atMs: now, question: question.slice(0, QUESTION_MAX), text: text.slice(0, 300) }].slice(-MAX_ANSWERS);
      if (s.lastNote) s.lastNote.questions = s.lastNote.questions.filter((q) => q !== question);
      // Only the rider's own words are checked, so a "fine" answer to a question about a knee is no complaint.
      this.keepComplaint(id, s, text, now);
      s.dirty = true; s.attempts = 0;
    });
  }

  /** A body complaint goes to the bike coach and stays as a preference of its own. */
  private keepComplaint(id: string, s: GymState, text: string, now: number): void {
    if (!complaintFromNote(text)) return;
    this.deps.complaint(id, text);
    s.rules = [...s.rules, { atMs: now, text: text.slice(0, 200) }].slice(-MAX_RULES);
  }

  skipQuestion(id: string, question: string): void {
    this.update(id, (s) => { if (s.lastNote) s.lastNote.questions = s.lastNote.questions.filter((q) => q !== question); });
  }

  removeRule(id: string, atMs: number): void {
    this.update(id, (s) => { s.rules = s.rules.filter((r) => r.atMs !== atMs); });
  }

  forget(id: string): void {
    this.generation.set(id, this.gen(id) + 1);
    this.running.delete(id);
    this.states.delete(id);
    this.previews.delete(id);
    removeGymState(this.deps.dir, id);
  }

  /** Shows what would be written. Asks Hevy whether the routine was edited since the last write, and writes nothing. */
  async preview(id: string): Promise<{ workout: GymWorkout; edited: boolean } | null> {
    const writer = this.deps.writer(id);
    const s = this.state(id);
    if (!this.deps.ready(id) || !writer || !s.next || s.next.workout.exercises.length === 0) return null;
    const workout = structuredClone(s.next.workout);
    const fp = fingerprint(workout);
    try {
      const edited = s.routine ? await writer.editedSince(s.routine.routineId, s.routine.updatedAt) : false;
      this.previews.set(id, { fp, edited });
      return { workout, edited };
    } catch {
      return null;
    }
  }

  /** Writes the previewed workout. Stale when the workout changed since the preview or the routine was edited in Hevy after it. */
  async confirm(id: string, name: string): Promise<'written' | 'stale' | 'failed'> {
    const writer = this.deps.writer(id);
    const start = this.state(id).next;
    if (!this.deps.ready(id) || !writer || !start || start.workout.exercises.length === 0 || this.writing.has(id)) return 'failed';
    const shown = this.previews.get(id);
    if (!shown || shown.fp !== fingerprint(start.workout)) return 'stale';
    this.writing.add(id);
    const gen = this.gen(id);
    try {
      const known = this.state(id).routine;
      // An edit the rider already saw in the preview was confirmed with it. Only a new one makes this stale.
      if (known && !shown.edited && await writer.editedSince(known.routineId, known.updatedAt)) return 'stale';
      const current = this.state(id).next;
      if (!this.deps.ready(id) || this.gen(id) !== gen) return 'failed';
      if (!current || fingerprint(current.workout) !== shown.fp) return 'stale';
      const workout = { ...structuredClone(current.workout), name: name.trim().slice(0, NAME_MAX) || current.workout.name };
      const written = await writer.writeRoutine(workout, { routineId: known?.routineId ?? null, updatedAt: known?.updatedAt ?? null });
      this.previews.delete(id);
      this.updateIf(gen, id, (s) => { s.routine = { routineId: written.routineId, updatedAt: written.updatedAt }; });
      return 'written';
    } catch (e) {
      if (!refusedByHevy(e)) return 'failed';
      // Probably a template that vanished: retrying the same workout would never work, so the rider gets a rebuilt plan.
      if (this.deps.ready(id)) { try { await this.deps.refreshTemplates(id); } catch { /* the plan uses what is known */ } }
      this.previews.delete(id);
      this.updateIf(gen, id, (s) => { s.dirty = true; s.attempts = 0; });
      return 'stale';
    } finally {
      this.writing.delete(id);
    }
  }
}

/** Every figure the coach may name: what was done and what is planned, plus the rep range. */
function figures(real: StrengthWorkout[], planned: GymWorkout): { weights: number[]; reps: number[]; sets: number[] } {
  const weights: number[] = [];
  const reps: number[] = [REP_MIN, REP_MAX, WIDOWMAKER_REPS];
  const sets: number[] = [1];
  for (const w of real) {
    let total = 0;
    for (const e of w.exercises) {
      sets.push(e.workSets.length, e.sets);
      total += e.workSets.length;
      for (const s of e.workSets) { if (s.weightKg !== null) weights.push(s.weightKg); if (s.reps !== null) reps.push(s.reps); }
    }
    sets.push(total);
  }
  let total = 0;
  for (const e of planned.exercises) {
    sets.push(e.sets.length);
    total += e.sets.length;
    for (const s of e.sets) {
      if (s.weightKg !== null) weights.push(s.weightKg);
      for (const r of [s.reps, s.repRange?.start, s.repRange?.end]) if (r !== null && r !== undefined) reps.push(r);
    }
  }
  sets.push(total);
  return { weights, reps, sets };
}
