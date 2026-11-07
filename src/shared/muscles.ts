/**
 * The muscle vocabulary of exercises. `shoulders` is legacy (data from before the three shoulder parts existed) and
 * counts as `front_delts`. Keys must stay in sync with what the catalog, the exercise mapper and Hevy templates use.
 */
export const MUSCLES: Record<string, string> = {
  quadriceps: 'Oberschenkel vorn', hamstrings: 'Oberschenkel hinten', glutes: 'Gesäß', calves: 'Waden', abductors: 'Abduktoren', adductors: 'Adduktoren',
  chest: 'Brust', shoulders: 'Schultern', front_delts: 'Schulter vorn', side_delts: 'Schulter seitlich', rear_delts: 'Schulter hinten',
  triceps: 'Trizeps', biceps: 'Bizeps', forearms: 'Unterarme', traps: 'Nacken und Trapez',
  lats: 'Latissimus', upper_back: 'Oberer Rücken', lower_back: 'Unterer Rücken', abdominals: 'Bauch', full_body: 'Ganzkörper', cardio: 'Ausdauer', other: 'Sonstiges',
};

/** Allowed equipment values with their labels. */
export const EQUIPMENT: Record<string, string> = { barbell: 'Langhantel', dumbbell: 'Kurzhantel', machine: 'Maschine oder Kabel', kettlebell: 'Kettlebell', none: 'Ohne Gerät', other: 'Sonstiges' };
/** Allowed exercise types with their labels. */
export const TYPES: Record<string, string> = { weight_reps: 'Gewicht und Wiederholungen', reps_only: 'Nur Wiederholungen', duration: 'Zeit in Sekunden', bodyweight_weighted: 'Körpergewicht plus Zusatzgewicht' };
