import { CHAT_CONTEXT, CHAT_KEEP_MS, chatThread, readWorkoutChange, waitingMessage, type ChatEntry, type ChatMessage } from '../../shared/chat';
import { EXERCISES, type Exercise } from '../../shared/exercises';
import { checkOps, gehtNicht } from '../../tracking/workout-change';
import type { TrackedWorkout } from '../../tracking/session';
import type { TrackedRecord } from '../../shared/records';
import { readStats, STATS_ID } from '../../shared/stats';
import { addDays, checkWeekPlan, mondayOf, parseProposal, planOfWeek, WEEKDAY_LABEL, type WeekProposal } from '../../shared/week-plan';
import { ClaudeError } from '../claude-client';
import { dateKey } from '../day-load';
import { dataBlock } from '../meals/prompt';
import type { RecordStore } from '../tracking/store';
import { LONG_TERM_GUIDE, weekHistory } from './long-term';
import { readTasks, tasksJsonSchema, type CoachId } from '../coach-tasks';

type Ask = (input: { prompt: string; systemPrompt: string; schema: object }) => Promise<unknown>;
type Deps = {
  store: Pick<RecordStore, 'all' | 'put'>;
  ask: Ask;
  nowMs: () => number;
  newId: () => string;
  /** The gym coach's goal ("muscle" …), or null. */
  goal?: (profileId: string) => string | null;
  /** The profile's complaints (the bike coach keeps them; every coach reads them). Without: the complaint records. */
  complaints?: (profileId: string) => { id: string; text: string; status: string }[];
  /** Starts a complaint the rider told the chat about. */
  /** The profile's merged exercise catalog; decides which swap targets exist. Defaults to the built-ins. */
  catalog?: (profileId: string) => Exercise[];
  addComplaint?: (profileId: string, text: string) => void;
  /** Ends a complaint the rider said is over. */
  endComplaint?: (profileId: string, complaintId: string) => void;
  /** What the bike, gym and run coach have planned next, for answers about a single session. */
  sessions?: (profileId: string) => object | null;
  /** Hands a change the rider asked for to the coach in charge, who plans again at once. */
  giveTask?: (profileId: string, task: { to: CoachId; text: string; lasting: boolean }) => void;
};

/** A rider message older than this gets no late answer. */
const STALE_MS = 2 * 86_400_000;
const DAYS_SHOWN = 28;

export const CHAT_SYSTEM_PROMPT = `Du bist der Coach in Pandafit für Rad, Kraft, Laufen und Beweglichkeit, alles zusammen. Du sprichst Deutsch, kurz und warm, duzt, ohne Schuld und ohne Druck: keine Serien, kein Nachholen verpasster Einheiten, eine leichte Woche ist in Ordnung.
Du planst mit der Person ihre Woche: welche Sportart an welchem Tag und wie hart. Ruhetage gehören zum Plan, nicht jeder Tag ist Training.
Die einzelnen Einheiten (Übungen, Sätze, Watt, Laufminuten) planen der Rad-Coach (bike), der Kraft-Coach (gym) und der Lauf-Coach (run); was sie als Nächstes geplant haben, steht in einheiten. Fragen dazu beantwortest du selbst, fachlich und sportwissenschaftlich begründet. Verweise die Person nie an einen anderen Coach oder ins Training.
Will die Person an einer Einheit etwas ändern (etwa "nur eine Trizepsübung", "mehr Beine", "Samstag kürzer"), gib dem zuständigen Coach in tasks einen Auftrag: coach, text als klare Anweisung in ihren Worten, lasting true, wenn es ein Wunsch für länger ist, sonst false. Der Coach plant dann sofort neu. Sag in text kurz, was du weitergegeben hast. Ohne Änderungswunsch ist tasks leer.
Die Person kann Mengen nennen ("2× Kraft, 3× Rad"), feste Tage ("Freitag Studio") oder dich vorschlagen lassen; oft eine Mischung. Feste Wünsche der Person markierst du mit fixed true.
Stelle höchstens eine Frage auf einmal und nur, wenn die Antwort den Plan ändert. Wenn du genug weißt, mach einen Vorschlag.
Ein Vorschlag (proposal) ist immer eine ganze Woche von Montag bis Sonntag (sieben Tage, date im Format JJJJ-MM-TT, aus wocheJetzt oder wocheNaechste) mit sport bike, gym, run, mobility oder rest und hardness easy, moderate oder hard. Bei Krafttagen sagt legs, ob Beine trainiert werden; long markiert die lange Rad- oder Laufeinheit. note ist optional und kurz. Ohne Vorschlag ist proposal null. Du änderst nie etwas still: Ein Vorschlag gilt erst, wenn die Person ihn übernimmt.
Regeln, die der Code prüft: höchstens zwei harte Tage pro Woche; kein harter Rad- oder Lauftag am Tag nach einem harten Beintag; die lange Einheit nicht am Tag nach einem Beintag; eine Sportart pro Tag.
Will die Person ausdrücklich mehr als die Regeln erlauben, sag einmal klar und ohne Drama, was du davon hältst, und setze riderAskedForMore auf true; sonst ist es false. Bei offenen Beschwerden (beschwerden) bleibst du vorsichtig, das gilt immer.
Plane nur Sportarten, die die Person macht oder ausdrücklich will (siehe letzteTage). Hevy und Garmin sind optional; erwähne sie nicht.
Beschwerden kommen jetzt über diesen Chat: Erzählt die Person von einem neuen Schmerz oder Zwicken (etwa "Knie zwickt"), setze newComplaint auf einen kurzen Text in ihren Worten und plane vorsichtig; sonst ist newComplaint null. Sagt sie, dass eine Beschwerde aus beschwerden vorbei ist, nenne deren id in complaintsOver; sonst ist complaintsOver leer. Frag nicht nach, ob du sie eintragen sollst.
${LONG_TERM_GUIDE} Wenn es passt, sag in einem Halbsatz, wo die Person gerade steht (etwa „dritte volle Woche, nächste Woche darf leichter werden“).
Antworte in text in ein bis vier Sätzen. Medizinische Ratschläge gibst du nicht.`;

export const WORKOUT_SYSTEM_PROMPT = `Du bist der Coach in Pandafit und begleitest die Person gerade in ihrem laufenden Krafttraining. Du sprichst Deutsch, sehr kurz und warm, duzt; sie steht im Studio und liest zwischen zwei Sätzen.
Sie sagt dir etwa "Gerät belegt", "Schulter zwickt" oder "nur noch 30 Minuten". Schlag dann vor, wie der Rest dieses Trainings aussieht, als change mit ops; ohne Änderung ist change null.
ops: drop (die offenen Sätze einer Übung fallen weg), swap (die offenen Sätze wandern zu einer anderen Übung aus katalog, to ist deren id, nimm eine mit demselben Muskel und einem Gerät, das frei ist), sets (open: so viele offene Sätze bleiben), lighter (pct 5 bis 30: die offenen Sätze werden um so viel Prozent leichter). ex ist immer die ex-Kennung einer Übung aus training, die noch offene Sätze hat. Erledigte Sätze änderst du nie.
Bei Schmerzen: die betroffene Bewegung weglassen oder deutlich leichter, nie durchziehen; keine medizinischen Ratschläge. Erzählt die Person von einem neuen Schmerz, setze newComplaint auf einen kurzen Text in ihren Worten; sonst null. Sagt sie, eine Beschwerde aus beschwerden ist vorbei, nenne deren id in complaintsOver.
Nichts ändert sich, bevor die Person den Vorschlag übernimmt. text: ein bis zwei Sätze.`;

const workoutSchema = {
  type: 'object', additionalProperties: false, required: ['text', 'change', 'newComplaint', 'complaintsOver'],
  properties: {
    text: { type: 'string' },
    newComplaint: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    complaintsOver: { type: 'array', items: { type: 'string' } },
    change: { anyOf: [{ type: 'null' }, {
      type: 'object', additionalProperties: false, required: ['ops'],
      properties: { ops: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['op', 'ex'],
        properties: { op: { enum: ['drop', 'swap', 'sets', 'lighter'] }, ex: { type: 'string' }, to: { type: 'string' }, open: { type: 'integer' }, pct: { type: 'number' } },
      } } },
    }] },
  },
};

const answerSchema = {
  type: 'object', additionalProperties: false, required: ['text', 'proposal', 'riderAskedForMore', 'newComplaint', 'complaintsOver', 'tasks'],
  properties: {
    text: { type: 'string' },
    tasks: tasksJsonSchema,
    newComplaint: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    complaintsOver: { type: 'array', items: { type: 'string' } },
    riderAskedForMore: { type: 'boolean' },
    proposal: {
      anyOf: [{ type: 'null' }, {
        type: 'object', additionalProperties: false, required: ['weekStart', 'days'],
        properties: {
          weekStart: { type: 'string' },
          days: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['date', 'sport', 'hardness', 'fixed'],
            properties: {
              date: { type: 'string' }, sport: { enum: ['bike', 'gym', 'run', 'mobility', 'rest'] }, hardness: { enum: ['easy', 'moderate', 'hard'] },
              fixed: { type: 'boolean' }, legs: { type: 'boolean' }, long: { type: 'boolean' }, note: { type: 'string' },
            },
          } },
        },
      }],
    },
  },
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const weekday = (date: string) => WEEKDAY_LABEL[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];

/** Answers the rider's chat messages of the profiles coached here, one at a time per profile. */
export class ChatCoach {
  private busy = new Set<string>();
  constructor(private deps: Deps) {}

  isThinking(id: string): boolean { return this.busy.has(id); }

  /** Answers the waiting message, if any. Returns whether it wrote an answer. Never throws. */
  async tick(id: string): Promise<boolean> {
    if (this.busy.has(id)) return false;
    try {
      const all = this.deps.store.all(id, 'chat');
      this.prune(id, all);
      const thread = chatThread(all);
      const waiting = waitingMessage(thread);
      const now = this.deps.nowMs();
      if (!waiting || now - waiting.atMs > STALE_MS) return false;
      this.busy.add(id);
      let answer: ChatMessage;
      try {
        answer = waiting.inWorkout ? await this.answerWorkout(id, waiting, thread) : await this.answer(id, this.prompt(id, thread.slice(-CHAT_CONTEXT), now), now);
      } catch (e) {
        const limit = e instanceof ClaudeError && e.kind === 'limit';
        answer = { role: 'coach', text: limit ? 'Mein Claude-Kontingent ist gerade aufgebraucht. Schreib mir später nochmal.' : 'Ich komme gerade nicht durch. Schreib mir gleich nochmal.', atMs: this.deps.nowMs(), failed: true };
      }
      this.put(id, { ...answer, replyTo: waiting.id, ...(waiting.inWorkout ? { inWorkout: waiting.inWorkout } : {}) });
      return true;
    } catch { return false; } finally { this.busy.delete(id); }
  }

  private async answer(id: string, prompt: string, now: number, fromRider = true): Promise<ChatMessage> {
    const ask = async (p: string) => {
      const raw = await this.deps.ask({ prompt: p, systemPrompt: CHAT_SYSTEM_PROMPT, schema: answerSchema });
      if (!isObj(raw) || typeof raw.text !== 'string') throw new ClaudeError('invalid', 'Keine Antwort.');
      return {
        text: raw.text.trim().slice(0, 1500), proposal: this.proposalOf(raw.proposal, now), more: raw.riderAskedForMore === true,
        complaint: typeof raw.newComplaint === 'string' && raw.newComplaint.trim() ? raw.newComplaint.trim().slice(0, 200) : null,
        over: Array.isArray(raw.complaintsOver) ? raw.complaintsOver.filter((x): x is string => typeof x === 'string') : [],
        tasks: readTasks(raw.tasks),
      };
    };
    let a = await ask(prompt);
    // Only the rider's own words start or end a complaint, never a message the coach opened by itself.
    if (fromRider) this.applyComplaints(id, a.complaint, a.over);
    // Only the rider's own words change a session; a message the coach opened by itself never does.
    if (fromRider) for (const t of a.tasks) { try { this.deps.giveTask?.(id, t); } catch { /* the rider can ask again */ } }
    const careful = this.complaintList(id).length > 0;
    let broken = a.proposal ? checkWeekPlan(a.proposal.days) : [];
    if (broken.length && (!a.more || careful)) {
      try { a = await ask(`${prompt}\nDein Vorschlag bricht diese Regeln: ${broken.join(' ')} Korrigiere ihn.`); } catch { /* the first answer decides */ }
      broken = a.proposal ? checkWeekPlan(a.proposal.days) : [];
    }
    const msg: ChatMessage = { role: 'coach', text: a.text || 'Okay.', atMs: this.deps.nowMs() };
    if (a.proposal && broken.length === 0) msg.proposal = a.proposal;
    else if (a.proposal && a.more && !careful) { msg.proposal = a.proposal; msg.warnings = broken; }
    else if (a.proposal) msg.text += '\n\nMein Vorschlag passte nicht zu unseren Regeln für Erholung, deshalb lasse ich ihn weg. Sag mir, was dir wichtig ist, dann versuche ich es anders.';
    return msg;
  }

  /** Complaints apply at once, from the first answer: they only ever make the coaches more careful. */
  private applyComplaints(id: string, complaint: string | null, over: string[]): void {
    const open = this.complaintList(id);
    if (complaint && !open.some((c) => c.text.toLowerCase() === complaint.toLowerCase())) { try { this.deps.addComplaint?.(id, complaint); } catch { /* the rider can say it again */ } }
    for (const cid of over) if (open.some((c) => c.id === cid)) { try { this.deps.endComplaint?.(id, cid); } catch { /* stays open */ } }
  }

  /** An answer about the rest of the open workout the message was written in. */
  private async answerWorkout(id: string, waiting: ChatEntry, thread: ChatEntry[]): Promise<ChatMessage> {
    const rec = this.deps.store.all(id, 'workout').find((r) => r.id === waiting.inWorkout && !r.deleted);
    const w = rec && isObj(rec.body) && Array.isArray(rec.body.exercises) ? rec.body as unknown as TrackedWorkout : null;
    const at = this.deps.nowMs();
    if (!w || w.endMs !== null) return { role: 'coach', text: 'Dieses Training ist schon beendet. Für die Woche schreib mir gern im Tab Woche.', atMs: at };
    const sets = (s: TrackedWorkout['exercises'][number]['sets'], done: boolean) => s.filter((x) => (x.doneMs !== null) === done).map((x) => ({ kg: x.weightKg, wdh: x.reps, typ: x.type }));
    const prompt = [
      dataBlock('training', { name: w.title, minutenSeitStart: Math.round((at - w.startMs) / 60_000), uebungen: w.exercises.map((e) => ({ ex: e.rid, uebung: e.title, erledigt: sets(e.sets, true), offen: sets(e.sets, false) })) }),
      dataBlock('katalog', EXERCISES.map((e) => ({ id: e.id, titel: e.title, muskel: e.primaryMuscle, geraet: e.equipment }))),
      dataBlock('beschwerden', this.complaintList(id)),
      dataBlock('verlauf', thread.filter((m) => m.inWorkout === w.id).slice(-10).map((m) => ({ von: m.role === 'rider' ? 'person' : 'coach', text: m.text }))),
      'Antworte auf die letzte Nachricht der Person im Verlauf.',
    ].join('\n');
    const raw = await this.deps.ask({ prompt, systemPrompt: WORKOUT_SYSTEM_PROMPT, schema: workoutSchema });
    if (!isObj(raw) || typeof raw.text !== 'string') throw new ClaudeError('invalid', 'Keine Antwort.');
    this.applyComplaints(id, typeof raw.newComplaint === 'string' && raw.newComplaint.trim() ? raw.newComplaint.trim().slice(0, 200) : null,
      Array.isArray(raw.complaintsOver) ? raw.complaintsOver.filter((x): x is string => typeof x === 'string') : []);
    const msg: ChatMessage = { role: 'coach', text: raw.text.trim().slice(0, 1000) || 'Okay.', atMs: this.deps.nowMs(), inWorkout: w.id };
    const change = isObj(raw.change) ? readWorkoutChange({ workoutId: w.id, ops: raw.change.ops }) : null;
    const { ops, reasons } = change ? checkOps(change, w, this.deps.catalog?.(id) ?? EXERCISES) : { ops: [], reasons: [] };
    if (ops.length > 0) msg.workoutChange = { workoutId: w.id, ops };
    const line = gehtNicht(reasons);
    if (line) msg.text = `${msg.text}\n${line}`;
    return msg;
  }

  /** A proposal for this or next week only. */
  private proposalOf(x: unknown, now: number): WeekProposal | null {
    const p = parseProposal(x);
    const monday = mondayOf(dateKey(now));
    return p && (p.weekStart === monday || p.weekStart === addDays(monday, 7)) ? p : null;
  }

  private sessionsOf(id: string): object | null {
    try { return this.deps.sessions?.(id) ?? null; } catch { return null; }
  }

  /** The open complaints with their ids. */
  private complaintList(id: string): { id: string; text: string; status: string }[] {
    if (this.deps.complaints) return this.deps.complaints(id).filter((c) => c.status !== 'over');
    return this.deps.store.all(id, 'complaint').filter((r) => !r.deleted && isObj(r.body) && r.body.status !== 'over' && typeof r.body.text === 'string')
      .map((r) => ({ id: r.id, text: (r.body as { text: string }).text, status: String((r.body as { status: unknown }).status) }));
  }

  /** The week conversation: the coach opens it with a proposal for next week, without being asked. Never throws. */
  async openWeek(id: string): Promise<boolean> {
    if (this.busy.has(id)) return false;
    this.busy.add(id);
    try {
      const now = this.deps.nowMs();
      const thread = chatThread(this.deps.store.all(id, 'chat'));
      const prompt = this.prompt(id, thread.slice(-CHAT_CONTEXT), now, 'Das ist das Wochengespräch, die Person hat dir gerade nicht geschrieben. Blick in einem Halbsatz auf die letzte Woche zurück, ohne Schuld, und schlag die nächste Woche vor (wocheNaechste). Frag kurz, ob es so passt.');
      const msg = await this.answer(id, prompt, now, false);
      this.put(id, { ...msg, push: true });
      return true;
    } catch { return false; } finally { this.busy.delete(id); }
  }

  /**
   * After a new activity, planned or not: checks this week's accepted plan and, only when the rest of the week should change,
   * proposes the updated week. The accepted plan stays until the rider takes the proposal. 'busy' means: try again later.
   * Never throws.
   */
  async reviewWeek(id: string, activities: object[]): Promise<'busy' | 'done'> {
    if (this.busy.has(id)) return 'busy';
    const now = this.deps.nowMs();
    const monday = mondayOf(dateKey(now));
    if (!planOfWeek(this.deps.store.all(id, 'weekplan'), monday)) return 'done';
    this.busy.add(id);
    try {
      const thread = chatThread(this.deps.store.all(id, 'chat'));
      const prompt = this.prompt(id, thread.slice(-CHAT_CONTEXT), now, [
        dataBlock('neueAktivitaeten', activities),
        'Die Person hat dir gerade nicht geschrieben. Das sind neue Aktivitäten, geplant oder nicht. Prüf, ob der Rest dieser Woche (wocheJetzt) danach noch passt. '
        + 'Wenn eine Aktivität den Plan verändert (zum Beispiel ungeplant, länger oder härter als geplant), schlag die angepasste Woche vor (wocheJetzt): '
        + 'vergangene Tage so, wie sie wirklich waren, die kommenden Tage angepasst. Sag in ein bis zwei Sätzen, was du warum änderst; '
        + 'die Person entscheidet, ob sie beim alten Plan bleibt. Passt der Plan weiterhin, gib proposal null.',
      ].join('\n'));
      const msg = await this.answer(id, prompt, now, false);
      // Only an updated plan for this week is news; everything else stays silent.
      if (msg.proposal?.weekStart === monday) this.put(id, { ...msg, push: true });
      return 'done';
    } catch { return 'done'; } finally { this.busy.delete(id); }
  }

  private prompt(id: string, thread: ReturnType<typeof chatThread>, now: number, instruction = 'Antworte auf die letzte Nachricht der Person im Verlauf.'): string {
    const today = dateKey(now);
    const monday = mondayOf(today);
    const plans = this.deps.store.all(id, 'weekplan');
    const stats = readStats(this.deps.store.all(id, 'stats').find((r) => r.id === STATS_ID && !r.deleted)?.body);
    const from = addDays(today, -DAYS_SHOWN);
    const days = (stats?.days ?? []).filter((d) => d.date >= from && d.date <= today)
      .map((d) => ({ date: d.date, tag: weekday(d.date), minuten: Object.fromEntries(Object.entries(d.minutes).filter(([, m]) => m > 0)), hart: d.hardness, beine: d.legs }))
      .filter((d) => Object.keys(d.minuten).length > 0);
    const week = (m: string) => planOfWeek(plans, m)?.days.map(({ date, sport, hardness, fixed, legs, long, note }) => ({ date, tag: weekday(date), sport, hardness, fixed, legs, long, note })) ?? null;
    return [
      dataBlock('heute', { datum: today, tag: weekday(today) }),
      dataBlock('wocheJetzt', { montag: monday, plan: week(monday) }),
      dataBlock('wocheNaechste', { montag: addDays(monday, 7), plan: week(addDays(monday, 7)) }),
      dataBlock('letzteTage', days),
      dataBlock('einheiten', this.sessionsOf(id)),
      dataBlock('wochenVerlauf', weekHistory(this.deps.store.all(id, 'stats'), now)),
      dataBlock('ziel', this.deps.goal?.(id) ?? null),
      dataBlock('beschwerden', this.complaintList(id)),
      dataBlock('verlauf', thread.map((m) => ({ von: m.role === 'rider' ? 'person' : 'coach', text: m.text, ...(m.proposal ? { vorschlagFuerWoche: m.proposal.weekStart } : {}), ...(m.takes ? { hatUebernommen: true } : {}), ...(m.declines ? { hatAbgelehnt: true } : {}) }))),
      instruction,
    ].join('\n');
  }

  /** Writes a coach message the rider did not ask for. */
  say(id: string, m: ChatMessage): void { this.put(id, m); }

  private put(id: string, m: ChatMessage): void {
    const r: TrackedRecord = { kind: 'chat', id: this.deps.newId(), updatedMs: Math.max(m.atMs, this.deps.nowMs()), deleted: false, body: m };
    this.deps.store.put(id, r);
  }

  /** Deletes messages older than 90 days. */
  private prune(id: string, all: TrackedRecord[]): void {
    const now = this.deps.nowMs();
    for (const r of all) {
      if (r.deleted || !isObj(r.body) || typeof r.body.atMs !== 'number' || now - r.body.atMs <= CHAT_KEEP_MS) continue;
      this.deps.store.put(id, { ...r, deleted: true, updatedMs: Math.max(now, r.updatedMs + 1) });
    }
  }
}
