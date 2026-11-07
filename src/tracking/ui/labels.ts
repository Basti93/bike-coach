export { EQUIPMENT, MUSCLES, TYPES } from '../../shared/muscles';
import { EQUIPMENT, MUSCLES } from '../../shared/muscles';
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
