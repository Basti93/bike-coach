import type { TrackedRecord } from '../../shared/records';
import { addDays, mondayOf, planOfWeek, SPORT_LABEL, WEEKDAY_LABEL, type Sport } from '../../shared/week-plan';
import { dateKey } from '../day-load';
import { dataBlock } from '../meals/prompt';

/**
 * The accepted week plan for a coach's prompt: the next seven days from today, and what it means for this coach. Empty without
 * a plan: the coach plans as before. The plan is a strong hint; the coach's own load logic (complaints, a hard day before) wins
 * when it says less.
 */
export function planHint(records: TrackedRecord[], nowMs: number, sport: Exclude<Sport, 'rest' | 'mobility'>): string {
  const today = dateKey(nowMs);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)).flatMap((date) => {
    const d = planOfWeek(records, mondayOf(date))?.days.find((x) => x.date === date);
    return d ? [{ date, tag: WEEKDAY_LABEL[(new Date(`${date}T12:00:00`).getDay() + 6) % 7], sport: d.sport, hardness: d.hardness, fest: d.fixed, ...(d.long ? { lang: true } : {}), ...(d.note ? { notiz: d.note } : {}) }] : [];
  });
  if (days.length === 0) return '';
  return `\n${dataBlock('wochenplan', days)}\nDie Person hat diesen Wochenplan mit dem Coach abgesprochen. Plane deine nächste Einheit (${SPORT_LABEL[sport]}, sport "${sport}") für den nächsten Tag im Wochenplan mit diesem Sport und bleib in dessen hardness (easy locker, moderate mittel, hard hart; lang ist die lange Einheit). Ruhetage (rest) bleiben frei. Steht dein Sport in den nächsten sieben Tagen nicht im Plan, plane trotzdem eine Einheit, aber locker. Sagen deine eigenen Daten weniger (Beschwerden, harte Tage davor), gilt weniger.`;
}
