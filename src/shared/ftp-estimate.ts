/**
 * Grobe FTP-Schätzung ohne Test. Quellen, Fehler und eigene Annahmen stehen in docs/ftp-estimate.md.
 * Der Startwert liegt bewusst unter dem rechnerischen Wert, die Fahrten korrigieren ihn danach.
 */
export type Sex = 'male' | 'female' | 'unknown';
export type EstimateInput = { age: number; sex: Sex; weightKg: number; heightCm: number; activity: number; run5kMin?: number };
export type FtpEstimate = { startW: number; likelyW: number; capW: number };

const SEE = 5.6; // Standardfehler nach Jackson 1990
const CYCLING_FACTOR = 0.9; // Annahme: Abschlag für nicht radtrainierte Personen
const FTP_OF_MAP = 0.75; // Annahme aus Coaching-Quellen
const CAP_W_PER_KG: Record<Sex, number> = { male: 2.78, female: 2.35, unknown: 2.35 }; // Obergrenze „Fair“, Allen/Coggan nach Garmin
const MIN_W = 50;

/** Jackson et al. 1990, N-Ex-Modell mit BMI. Aktivität ist die PA-R-Skala 0 bis 7. */
export const vo2maxFromProfile = (i: EstimateInput): number => {
  const bmi = i.weightKg / (i.heightCm / 100) ** 2;
  return 56.363 + 1.921 * i.activity - 0.381 * i.age - 0.754 * bmi + (i.sex === 'male' ? 10.987 : 0);
};

/** Daniels/Gilbert (VDOT). */
export const vo2maxFromRun = (minutes: number): number => {
  const v = 5000 / minutes;
  const cost = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const share = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
  return cost / share;
};

/** ACSM-Beinergometer, nach der Leistung am Maximum aufgelöst: VO2 = 1,8 · kgm/min / kg + 7, 1 W = 6 kgm/min. */
const ftpFromVo2 = (vo2: number, weightKg: number): number =>
  ((vo2 * CYCLING_FACTOR - 7) * weightKg / 1.8 / 6) * FTP_OF_MAP;

export const estimateFtp = (i: EstimateInput): FtpEstimate => {
  const fromProfile = vo2maxFromProfile(i);
  const vo2 = i.run5kMin ? Math.min(fromProfile, vo2maxFromRun(i.run5kMin)) : fromProfile;
  const capW = Math.round(CAP_W_PER_KG[i.sex] * i.weightKg);
  const bound = (w: number) => Math.round(Math.max(MIN_W, Math.min(capW, w)));
  return { startW: bound(ftpFromVo2(vo2 - SEE, i.weightKg)), likelyW: bound(ftpFromVo2(vo2, i.weightKg)), capW };
};

export const ACTIVITY_LEVELS = [
  'Kaum Bewegung, immer Aufzug und Auto',
  'Spazieren und Treppen, gelegentlich außer Atem',
  'Mäßig (Golf, Kraft, Garten), 10 bis 60 Min./Woche',
  'Mäßig (Golf, Kraft, Garten), über 1 Std./Woche',
  'Harter Sport (Laufen, Rad, Tennis), unter 30 Min./Woche',
  'Harter Sport, 30 bis 60 Min./Woche oder 1,6 bis 8 km Laufen',
  'Harter Sport, 1 bis 3 Std./Woche oder 8 bis 16 km Laufen',
  'Harter Sport, über 3 Std./Woche oder über 16 km Laufen',
];
