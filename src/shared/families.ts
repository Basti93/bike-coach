/**
 * Movement families: which exercises are variants of one movement ("all squats"). A fixed list; `other` is the catch-all and can
 * never be excluded as a family. An exercise carries its family as data (`Exercise.family`); no family means `other`.
 */
export const FAMILIES = [
  { id: 'squat', label: 'Kniebeuge' },
  { id: 'lunge', label: 'Ausfallschritt' },
  { id: 'hinge', label: 'Kreuzheben' },
  { id: 'hip-thrust', label: 'Hip Thrust' },
  { id: 'leg-press', label: 'Beinpresse' },
  { id: 'leg-curl', label: 'Beinbeuger' },
  { id: 'leg-extension', label: 'Beinstrecker' },
  { id: 'calf', label: 'Wadenheben' },
  { id: 'bench-press', label: 'Bankdrücken' },
  { id: 'incline-press', label: 'Schrägbankdrücken' },
  { id: 'fly', label: 'Fliegende' },
  { id: 'dip', label: 'Dips' },
  { id: 'push-up', label: 'Liegestütze' },
  { id: 'overhead-press', label: 'Schulterdrücken' },
  { id: 'lateral-raise', label: 'Seitheben' },
  { id: 'rear-delt', label: 'Hintere Schulter' },
  { id: 'row', label: 'Rudern' },
  { id: 'pulldown', label: 'Latzug' },
  { id: 'pull-up', label: 'Klimmzug' },
  { id: 'curl', label: 'Curl' },
  { id: 'triceps', label: 'Trizepsstrecken' },
  { id: 'shrug', label: 'Schulterheben' },
  { id: 'core', label: 'Rumpf' },
  { id: 'carry', label: 'Tragen' },
  { id: 'other', label: 'Sonstige' },
] as const;

export type FamilyId = (typeof FAMILIES)[number]['id'];
export const FAMILY_IDS: readonly string[] = FAMILIES.map((f) => f.id);
export const MAX_FAMILIES = 5;

export const isFamily = (x: unknown): x is FamilyId => typeof x === 'string' && FAMILY_IDS.includes(x);
/** A family a rule may exclude: a known one, never `other`. */
export const isExcludableFamily = (x: unknown): x is FamilyId => isFamily(x) && x !== 'other';
export const familyLabel = (id: string): string => FAMILIES.find((f) => f.id === id)?.label ?? id;
/** "Alle Varianten: Kniebeuge" for a family rule, else ''. */
export const familyLine = (r: { families?: string[] }): string => (r.families?.length ? `Alle Varianten: ${r.families.map(familyLabel).join(', ')}` : '');
/** The family of an exercise: its data field when valid, else `other`. */
export const familyOf = (e: { family?: string }): FamilyId => (isFamily(e.family) ? e.family : 'other');
