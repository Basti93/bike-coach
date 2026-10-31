import { clampTargetW } from '../shared/guardrails';
import type { RideEvent, Sample } from '../shared/sample';
import type { Session, Step } from '../shared/session';
import type { Reading } from './ble/device-manager';
import { effectiveGrade, MAX_GEAR, MIN_GEAR, NEUTRAL_GEAR } from './gears';

const GAP_THRESHOLD_MS = 5000;

export type EngineState = {
  stepIndex: number; stepRemainingS: number; rideElapsedS: number;
  targetW: number | null; gradePct: number | null; gear: number | null;
  label: string; nextLabel: string | null; secondsToNext: number;
};
export type TrainerCommand = { targetW?: number; gradePct?: number };
export type EngineOptions = {
  session: Session; ftpW: number; gradePerGear: number; resumeAtS?: number; startSeq?: number; nowMs: () => number;
};

export class RideEngine {
  private elapsedS: number;
  private seq: number;
  private gear = NEUTRAL_GEAR;
  private adjustPct = 0;
  private adjustedStep = -1;
  private lastMs: number | null = null;
  private lastSent: string | null = null;
  private latest: Required<{ [K in keyof Reading]: number | null }> = { powerW: null, cadenceRpm: null, speedKph: null, hrBpm: null };

  constructor(private opts: EngineOptions) {
    this.elapsedS = opts.resumeAtS ?? 0;
    this.seq = opts.startSeq ?? 0;
  }

  tick(reading: Reading): { sample: Sample; command: TrainerCommand | null; events: RideEvent[] } {
    const now = this.opts.nowMs();
    const events: RideEvent[] = [];
    if (this.lastMs !== null && now - this.lastMs > GAP_THRESHOLD_MS) {
      events.push({ wallClockMs: this.lastMs, type: 'gap-start' }, { wallClockMs: now, type: 'gap-end' });
    }
    this.lastMs = now;
    this.latest = {
      powerW: reading.powerW ?? null, cadenceRpm: reading.cadenceRpm ?? null,
      speedKph: reading.speedKph ?? null, hrBpm: reading.hrBpm ?? null,
    };
    this.elapsedS += 1;
    const targets = this.targets(this.elapsedS - 1);
    const sample: Sample = {
      seq: this.seq++, wallClockMs: now, rideElapsedS: this.elapsedS, ...this.latest,
      targetW: targets.targetW, gradePct: targets.gradePct, gear: targets.gradePct === null ? null : this.gear,
    };
    const command: TrainerCommand = targets.gradePct === null ? { targetW: targets.targetW! } : { gradePct: targets.gradePct };
    const key = JSON.stringify(command);
    const changed = key !== this.lastSent;
    this.lastSent = key;
    return { sample, command: changed ? command : null, events };
  }

  shift(dir: 'up' | 'down'): void {
    if (this.position(this.elapsedS).step.kind !== 'grade') return;
    this.gear = Math.min(MAX_GEAR, Math.max(MIN_GEAR, this.gear + (dir === 'up' ? 1 : -1)));
  }

  adjustTarget(deltaPct: number): RideEvent {
    const { index } = this.position(this.elapsedS);
    this.adjustPct = (index === this.adjustedStep ? this.adjustPct : 0) + deltaPct;
    this.adjustedStep = index;
    return { wallClockMs: this.opts.nowMs(), type: 'target-adjust', detail: `${deltaPct}` };
  }

  state(): EngineState {
    const at = Math.min(this.elapsedS, this.totalS() - 1);
    const { step, index, remainingS } = this.position(at);
    const next = this.opts.session.steps[index + 1];
    const t = this.targets(at);
    return {
      stepIndex: index, stepRemainingS: remainingS, rideElapsedS: this.elapsedS,
      targetW: t.targetW, gradePct: t.gradePct, gear: t.gradePct === null ? null : this.gear,
      label: step.label, nextLabel: next?.label ?? null, secondsToNext: remainingS,
    };
  }

  isDone(): boolean { return this.elapsedS >= this.totalS(); }

  private totalS(): number { return this.opts.session.steps.reduce((sum, s) => sum + s.durationS, 0); }

  private position(atS: number): { step: Step; index: number; remainingS: number } {
    const steps = this.opts.session.steps;
    let start = 0;
    for (let index = 0; index < steps.length; index++) {
      const end = start + steps[index].durationS;
      if (atS < end) return { step: steps[index], index, remainingS: end - atS };
      start = end;
    }
    return { step: steps[steps.length - 1], index: steps.length - 1, remainingS: 0 };
  }

  private targets(atS: number): { targetW: number | null; gradePct: number | null } {
    const { step, index } = this.position(atS);
    if (step.kind === 'grade') {
      return { targetW: null, gradePct: effectiveGrade(step.gradePct, step.scale, this.gear, this.opts.gradePerGear) };
    }
    const base = step.ftpFraction * this.opts.ftpW;
    const factor = index === this.adjustedStep ? 1 + this.adjustPct / 100 : 1;
    return { targetW: Math.round(clampTargetW(base * factor, this.opts.ftpW)), gradePct: null };
  }
}
