export const MUSCLES: Record<string, string> = {
  quadriceps: 'Oberschenkel vorn', hamstrings: 'Oberschenkel hinten', glutes: 'Gesäß', calves: 'Waden', abductors: 'Abduktoren', adductors: 'Adduktoren',
  chest: 'Brust', shoulders: 'Schultern', triceps: 'Trizeps', biceps: 'Bizeps', forearms: 'Unterarme', traps: 'Nacken und Trapez',
  lats: 'Latissimus', upper_back: 'Oberer Rücken', lower_back: 'Unterer Rücken', abdominals: 'Bauch', full_body: 'Ganzkörper', cardio: 'Ausdauer', other: 'Sonstiges',
};
export const EQUIPMENT: Record<string, string> = { barbell: 'Langhantel', dumbbell: 'Kurzhantel', machine: 'Maschine oder Kabel', kettlebell: 'Kettlebell', none: 'Ohne Gerät', other: 'Sonstiges' };
export const TYPES: Record<string, string> = { weight_reps: 'Gewicht und Wiederholungen', reps_only: 'Nur Wiederholungen', duration: 'Zeit in Sekunden', bodyweight_weighted: 'Körpergewicht plus Zusatzgewicht' };
export const muscleLabel = (m: string): string => MUSCLES[m] ?? m;
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const dateLabel = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
