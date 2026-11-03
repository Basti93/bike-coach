import { CHAT_CONTEXT, CHAT_KEEP_MS, chatThread, waitingMessage, type ChatMessage } from '../../shared/chat';
import type { TrackedRecord } from '../../shared/records';
import { readStats, STATS_ID } from '../../shared/stats';
import { addDays, checkWeekPlan, mondayOf, parseProposal, planOfWeek, WEEKDAY_LABEL, type WeekProposal } from '../../shared/week-plan';
import { ClaudeError } from '../claude-client';
import { dateKey } from '../day-load';
import { dataBlock } from '../meals/prompt';
import type { RecordStore } from '../tracking/store';

type Ask = (input: { prompt: string; systemPrompt: string; schema: object }) => Promise<unknown>;
type Deps = {
  store: Pick<RecordStore, 'all' | 'put'>;
  ask: Ask;
  nowMs: () => number;
  newId: () => string;
  /** The gym coach's goal ("muscle" …), or null. */
  goal?: (profileId: string) => string | null;
};

/** A rider message older than this gets no late answer. */
const STALE_MS = 2 * 86_400_000;
const DAYS_SHOWN = 28;

export const CHAT_SYSTEM_PROMPT = `Du bist der Coach in Pandafit für Rad, Kraft, Laufen und Beweglichkeit, alles zusammen. Du sprichst Deutsch, kurz und warm, duzt, ohne Schuld und ohne Druck: keine Serien, kein Nachholen verpasster Einheiten, eine leichte Woche ist in Ordnung.
Du planst mit der Person ihre Woche: welche Sportart an welchem Tag und wie hart. Was in einer Einheit genau passiert (Übungen, Watt, Tempo), entscheiden die einzelnen Coaches; das planst du nicht. Ruhetage gehören zum Plan, nicht jeder Tag ist Training.
Die Person kann Mengen nennen ("2× Kraft, 3× Rad"), feste Tage ("Freitag Studio") oder dich vorschlagen lassen; oft eine Mischung. Feste Wünsche der Person markierst du mit fixed true.
Stelle höchstens eine Frage auf einmal und nur, wenn die Antwort den Plan ändert. Wenn du genug weißt, mach einen Vorschlag.
Ein Vorschlag (proposal) ist immer eine ganze Woche von Montag bis Sonntag (sieben Tage, date im Format JJJJ-MM-TT, aus wocheJetzt oder wocheNaechste) mit sport bike, gym, run, mobility oder rest und hardness easy, moderate oder hard. Bei Krafttagen sagt legs, ob Beine trainiert werden; long markiert die lange Rad- oder Laufeinheit. note ist optional und kurz. Ohne Vorschlag ist proposal null. Du änderst nie etwas still: Ein Vorschlag gilt erst, wenn die Person ihn übernimmt.
Regeln, die der Code prüft: höchstens zwei harte Tage pro Woche; kein harter Rad- oder Lauftag am Tag nach einem harten Beintag; die lange Einheit nicht am Tag nach einem Beintag; eine Sportart pro Tag.
Will die Person ausdrücklich mehr als die Regeln erlauben, sag einmal klar und ohne Drama, was du davon hältst, und setze riderAskedForMore auf true; sonst ist es false. Bei offenen Beschwerden (beschwerden) bleibst du vorsichtig, das gilt immer.
Plane nur Sportarten, die die Person macht oder ausdrücklich will (siehe letzteTage). Hevy und Garmin sind optional; erwähne sie nicht.
Antworte in text in ein bis vier Sätzen. Medizinische Ratschläge gibst du nicht.`;

const answerSchema = {
  type: 'object', additionalProperties: false, required: ['text', 'proposal', 'riderAskedForMore'],
  properties: {
    text: { type: 'string' },
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
      const prompt = this.prompt(id, thread.slice(-CHAT_CONTEXT), now);
      let answer: ChatMessage;
      try {
        answer = await this.answer(id, prompt, now);
      } catch (e) {
        const limit = e instanceof ClaudeError && e.kind === 'limit';
        answer = { role: 'coach', text: limit ? 'Mein Claude-Kontingent ist gerade aufgebraucht. Schreib mir später nochmal.' : 'Ich komme gerade nicht durch. Schreib mir gleich nochmal.', atMs: this.deps.nowMs(), failed: true };
      }
      this.put(id, { ...answer, replyTo: waiting.id });
      return true;
    } catch { return false; } finally { this.busy.delete(id); }
  }

  private async answer(id: string, prompt: string, now: number): Promise<ChatMessage> {
    const ask = async (p: string) => {
      const raw = await this.deps.ask({ prompt: p, systemPrompt: CHAT_SYSTEM_PROMPT, schema: answerSchema });
      if (!isObj(raw) || typeof raw.text !== 'string') throw new ClaudeError('invalid', 'Keine Antwort.');
      return { text: raw.text.trim().slice(0, 1500), proposal: this.proposalOf(raw.proposal, now), more: raw.riderAskedForMore === true };
    };
    let a = await ask(prompt);
    const careful = this.openComplaints(id).length > 0;
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

  /** A proposal for this or next week only. */
  private proposalOf(x: unknown, now: number): WeekProposal | null {
    const p = parseProposal(x);
    const monday = mondayOf(dateKey(now));
    return p && (p.weekStart === monday || p.weekStart === addDays(monday, 7)) ? p : null;
  }

  private openComplaints(id: string): string[] {
    return this.deps.store.all(id, 'complaint').filter((r) => !r.deleted && isObj(r.body) && r.body.status !== 'over' && typeof r.body.text === 'string').map((r) => (r.body as { text: string }).text);
  }

  private prompt(id: string, thread: ReturnType<typeof chatThread>, now: number): string {
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
      dataBlock('ziel', this.deps.goal?.(id) ?? null),
      dataBlock('beschwerden', this.openComplaints(id)),
      dataBlock('verlauf', thread.map((m) => ({ von: m.role === 'rider' ? 'person' : 'coach', text: m.text, ...(m.proposal ? { vorschlagFuerWoche: m.proposal.weekStart } : {}), ...(m.takes ? { hatUebernommen: true } : {}), ...(m.declines ? { hatAbgelehnt: true } : {}) }))),
      'Antworte auf die letzte Nachricht der Person im Verlauf.',
    ].join('\n');
  }

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
