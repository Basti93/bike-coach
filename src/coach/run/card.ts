import type { DayRating } from '../day-load';
import { kmText, paceText, type PlannedRun, type RunCard } from '../../shared/run';
import type { Run } from './garmin-runs';

const SLOWER = 1.03;
const HILLS_M_PER_KM = 15;
const HEAT_C = 25;
const SHORT_NIGHT_S = 6 * 3600;

const EASY = [
  'Ruhig gelaufen ist genau richtig. So wächst die Ausdauer.',
  'Locker unterwegs, so soll es sein. Die Ausdauer dankt es dir.',
  'Ein ruhiger Lauf baut leise die Grundlage auf.',
];
const LONG = [
  'Ein langer Lauf in ruhigem Tempo, das trägt die Woche.',
  'Lange und ruhig, so entsteht Ausdauer.',
];
const TEST = [
  'Der Testlauf zeigt, wo du heute stehst. Er ist nur ein Messpunkt.',
  'Ein Messpunkt für den Verlauf, mehr nicht.',
];
const NO_HR = [
  'Ohne Puls zählen Kilometer und Zeit. Ein Tempo lässt sich so nicht einordnen.',
  'Die Strecke ist gezählt. Mit Pulsgurt oder Uhr käme auch das ruhige Tempo dazu.',
];
const SHORT_EASY = [
  'Der ruhige Teil war diesmal kurz. Strecke und Zeit sind gezählt.',
  'Strecke und Zeit zählen. Für ein Tempo braucht es etwas mehr ruhige Minuten.',
];
const UNPLANNED = [
  'Ein Lauf ohne Plan zählt genauso für die Woche.',
  'Auch ein spontaner Lauf zählt für die Woche.',
];
const REASONS = {
  day: ['Nach dem anstrengenden Tag gestern ist das Tempo heute oft etwas gemächlicher. Das ist ganz normal.'],
  hills: ['Auf der Strecke lagen viele Höhenmeter, das erklärt das Tempo.'],
  heat: ['Bei der Wärme läuft es sich oft etwas gemächlicher. Das Tempo erklärt sich damit.'],
  sleep: ['Nach einer kurzen Nacht ist das Tempo oft etwas gemächlicher. Das ist ganz normal.'],
  none: ['Das Tempo schwankt von Tag zu Tag. Wichtig ist, dass der Lauf ruhig war.'],
};

const pick = (list: string[], seed: number): string => list[Math.abs(seed) % list.length]!;
const dateKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The short card after a run. A slower pace is explained by one reason at most, never judged. */
export function runCard(run: Run, planned: PlannedRun | null, ctx: { trendNow: number | null; dayBefore: DayRating | null; sleepS: number | null }): RunCard {
  const kind = planned?.kind ?? 'unplanned';
  const seed = Math.floor(run.startMs / 60_000);
  const km = run.distanceM !== null ? kmText(run.distanceM) : null;
  const minutes = Math.round(run.durationS / 60);
  const time = `${minutes} Min`;
  let counted: string;
  let result: string;
  let sentence: string;

  if (kind === 'test' && run.best30M !== null) {
    counted = `Testlauf, ${time}`;
    result = `Beste 30 Minuten: ${kmText(run.best30M)}`;
    sentence = pick(TEST, seed);
  } else if (!run.hasHr) {
    counted = `${time} ohne Puls gezählt`;
    result = km ?? time;
    sentence = pick(NO_HR, seed);
  } else if (run.easyPace === null) {
    counted = `${time}, davon zu wenig im ruhigen Bereich für ein Tempo`;
    result = km ?? time;
    sentence = pick(SHORT_EASY, seed);
  } else {
    counted = `${Math.round(run.easyPace.seconds / 60)} Min im ruhigen Bereich gezählt`;
    result = `${paceText(run.easyPace.sPerKm)}${km ? `, ${km}` : ''}`;
    const slower = ctx.trendNow !== null && run.easyPace.sPerKm > ctx.trendNow * SLOWER;
    if (!slower) {
      sentence = pick(kind === 'long' ? LONG : kind === 'unplanned' ? UNPLANNED : EASY, seed);
    } else {
      const hills = run.elevationGainM !== null && run.distanceM !== null && run.distanceM > 0 && run.elevationGainM / (run.distanceM / 1000) > HILLS_M_PER_KM;
      const reason = ctx.dayBefore && (ctx.dayBefore.hardness === 'hard' || ctx.dayBefore.legs) ? 'day'
        : hills ? 'hills'
        : run.tempC !== null && run.tempC >= HEAT_C ? 'heat'
        : ctx.sleepS !== null && ctx.sleepS < SHORT_NIGHT_S ? 'sleep' : 'none';
      sentence = pick(REASONS[reason], seed);
    }
  }
  return { runId: run.id, date: dateKey(run.startMs), kind, counted, result, sentence };
}
