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
