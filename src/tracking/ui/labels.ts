export { MUSCLES } from '../../shared/muscles';
import { MUSCLES } from '../../shared/muscles';
export const EQUIPMENT: Record<string, string> = { barbell: 'Langhantel', dumbbell: 'Kurzhantel', machine: 'Maschine oder Kabel', kettlebell: 'Kettlebell', none: 'Ohne Gerät', other: 'Sonstiges' };
export const TYPES: Record<string, string> = { weight_reps: 'Gewicht und Wiederholungen', reps_only: 'Nur Wiederholungen', duration: 'Zeit in Sekunden', bodyweight_weighted: 'Körpergewicht plus Zusatzgewicht' };
export const muscleLabel = (m: string): string => MUSCLES[m] ?? m;
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export { shortDate as dateLabel } from '../../shared/dates';
