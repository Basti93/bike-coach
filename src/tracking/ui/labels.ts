export { MUSCLES } from '../../shared/muscles';
import { MUSCLES } from '../../shared/muscles';
export const EQUIPMENT: Record<string, string> = { barbell: 'Langhantel', dumbbell: 'Kurzhantel', machine: 'Maschine oder Kabel', kettlebell: 'Kettlebell', none: 'Ohne Gerät', other: 'Sonstiges' };
export const TYPES: Record<string, string> = { weight_reps: 'Gewicht und Wiederholungen', reps_only: 'Nur Wiederholungen', duration: 'Zeit in Sekunden', bodyweight_weighted: 'Körpergewicht plus Zusatzgewicht' };
export const muscleLabel = (m: string): string => MUSCLES[m] ?? m;
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export { shortDate as dateLabel } from '../../shared/dates';
const words = (t: string): string[] => t.toLocaleLowerCase('de').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** The equipment label for a title, or '' when the title already names the equipment (any word of the label, case-insensitive). */
export function equipmentSuffix(title: string, equipment: string): string {
  const label = EQUIPMENT[equipment] ?? equipment;
  const inTitle = new Set(words(title));
  return words(label).some((w) => w.length > 3 && w !== 'oder' && inTitle.has(w)) ? '' : label;
}
