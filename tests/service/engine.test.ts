import { RideEngine } from '../../src/service/engine';
import { effectiveGrade } from '../../src/service/gears';
import type { Session } from '../../src/shared/session';

const session: Session = { id: 's', name: 'x', steps: [
  { kind: 'erg', durationS: 60, ftpFraction: 0.5, label: 'A' },
  { kind: 'grade', durationS: 60, gradePct: 5, scale: 0.8, label: 'B' },
] };
const clock = () => { let t = 0; const now = () => t; return { now, set: (v: number) => { t = v; }, step: () => { t += 1000; } }; };
const make = (c: ReturnType<typeof clock>, extra = {}) => new RideEngine({ session, ftpW: 200, gradePerGear: 0.5, nowMs: c.now, ...extra });
const run = (e: RideEngine, c: ReturnType<typeof clock>, n: number) => { let r; for (let i = 0; i < n; i++) { c.step(); r = e.tick({}); } return r!; };

test('erg step targets fraction of FTP', () => {
  const c = clock();
  expect(run(make(c), c, 1).command?.targetW).toBe(100);
});
test('moves to next step exactly on duration', () => {
  const c = clock(); const e = make(c);
  run(e, c, 59);
  expect(e.state().stepIndex).toBe(0);
  run(e, c, 1);
  expect(e.state().stepIndex).toBe(1);
});
test('resume starts at given second with correct step and seq', () => {
  const c = clock(); const e = make(c, { resumeAtS: 90, startSeq: 91 });
  const r = run(e, c, 1);
  expect(r.sample.seq).toBe(91);
  expect(e.state().stepIndex).toBe(1);
  expect(r.command?.gradePct).toBe(4);
});
test('gap over 5s of wall clock emits gap events and does not advance ride time', () => {
  const c = clock(); const e = make(c);
  run(e, c, 3);
  c.set(c.now() + 300000);
  const r = e.tick({});
  expect(r.sample.rideElapsedS).toBe(4);
  expect(r.events.map((x) => x.type)).toEqual(['gap-start', 'gap-end']);
});
test('adjustTarget is clamped and logged', () => {
  const c = clock(); const e = make(c);
  expect(e.adjustTarget(500).type).toBe('target-adjust');
  expect(run(e, c, 1).sample.targetW).toBe(300);
});
test('adjustTarget lasts only for the current step', () => {
  const c = clock(); const e = new RideEngine({ session: { ...session, steps: [session.steps[0], session.steps[0]] }, ftpW: 200, gradePerGear: 0.5, nowMs: c.now });
  e.adjustTarget(10);
  expect(run(e, c, 1).sample.targetW).toBe(110);
  expect(run(e, c, 60).sample.targetW).toBe(100);
});
test('shift in erg step changes nothing', () => {
  const c = clock(); const e = make(c);
  run(e, c, 1);
  e.shift('up');
  expect(e.state().gear).toBeNull();
  expect(run(e, c, 1).command).toBeNull();
});
test('grade step sends scaled grade plus gear offset', () => {
  const c = clock(); const e = make(c, { resumeAtS: 60 });
  run(e, c, 1);
  e.shift('up'); e.shift('up');
  expect(run(e, c, 1).command?.gradePct).toBe(5);
});
test('gears stay within limits and grade is clamped', () => {
  expect(effectiveGrade(100, 1, 6, 0.5)).toBe(20);
  expect(effectiveGrade(-100, 1, 6, 0.5)).toBe(-10);
  const c = clock(); const e = make(c, { resumeAtS: 60 });
  run(e, c, 1);
  for (let i = 0; i < 20; i++) e.shift('down');
  expect(e.state().gear).toBe(1);
});
test('null readings still produce a sample', () => {
  const c = clock();
  const r = run(make(c), c, 1);
  expect(r.sample.powerW).toBeNull();
  expect(r.sample.hrBpm).toBeNull();
});
test('is done after all steps', () => {
  const c = clock(); const e = make(c);
  run(e, c, 120);
  expect(e.isDone()).toBe(true);
});
test('a new step does not inherit an earlier adjustment', () => {
  const c = clock(); const e = new RideEngine({ session: { ...session, steps: [session.steps[0], session.steps[0]] }, ftpW: 200, gradePerGear: 0.5, nowMs: c.now });
  e.adjustTarget(10);
  run(e, c, 60);
  e.adjustTarget(5);
  expect(run(e, c, 1).sample.targetW).toBe(105);
});
describe('Absenken während der Fahrt', () => {
  const long: Session = { id: 's', name: 'x', steps: [{ kind: 'erg', durationS: 1000, ftpFraction: 1, label: 'A' }] };
  const auto = (c: ReturnType<typeof clock>, extra = {}) => new RideEngine({ session: long, ftpW: 200, gradePerGear: 0.5, nowMs: c.now, maxHrBpm: 170, ...extra });
  const feed = (e: RideEngine, c: ReturnType<typeof clock>, n: number, r: object) => {
    let last; const events: string[] = [];
    for (let i = 0; i < n; i++) { c.step(); last = e.tick(r); events.push(...last.events.map((x) => `${x.type}:${x.detail}`)); }
    return { last: last!, events };
  };
  test('heart rate above limit for 30 s lowers target by 5 %', () => {
    const c = clock(); const e = auto(c);
    expect(feed(e, c, 29, { hrBpm: 175, cadenceRpm: 90 }).last.sample.targetW).toBe(200);
    const { last, events } = feed(e, c, 2, { hrBpm: 175, cadenceRpm: 90 });
    expect(last.sample.targetW).toBe(190);
    expect(events).toContain('target-adjust:auto:hr');
  });
  test('short spike does nothing', () => {
    const c = clock(); const e = auto(c);
    feed(e, c, 20, { hrBpm: 175, cadenceRpm: 90 });
    feed(e, c, 5, { hrBpm: 150, cadenceRpm: 90 });
    expect(feed(e, c, 20, { hrBpm: 175, cadenceRpm: 90 }).last.sample.targetW).toBe(200);
  });
  test('cadence collapse lowers target', () => {
    const c = clock(); const e = auto(c);
    const { last, events } = feed(e, c, 21, { cadenceRpm: 40 });
    expect(last.sample.targetW).toBe(190);
    expect(events).toContain('target-adjust:auto:cadence');
  });
  test('reduction stops at 20 %', () => {
    const c = clock(); const e = auto(c);
    expect(feed(e, c, 500, { hrBpm: 190, cadenceRpm: 90 }).last.sample.targetW).toBe(160);
  });
  test('missing readings never reduce', () => {
    const c = clock(); const e = auto(c);
    expect(feed(e, c, 200, {}).last.sample.targetW).toBe(200);
  });
  test('no pulse limit means no pulse reduction', () => {
    const c = clock(); const e = auto(c, { maxHrBpm: undefined });
    expect(feed(e, c, 100, { hrBpm: 200, cadenceRpm: 90 }).last.sample.targetW).toBe(200);
  });
  test('ramp test is never reduced', () => {
    const c = clock();
    const e = new RideEngine({ session: { ...long, id: 'ramp-test' }, ftpW: 200, gradePerGear: 0.5, nowMs: c.now, maxHrBpm: 170 });
    expect(feed(e, c, 100, { hrBpm: 190, cadenceRpm: 30 }).last.sample.targetW).toBe(200);
  });
  test('a new step starts without the reduction', () => {
    const c = clock();
    const e = new RideEngine({ session: { ...long, steps: [{ ...long.steps[0], durationS: 40 }, { ...long.steps[0], durationS: 100 }] }, ftpW: 200, gradePerGear: 0.5, nowMs: c.now, maxHrBpm: 170 });
    feed(e, c, 35, { hrBpm: 190, cadenceRpm: 90 });
    expect(feed(e, c, 6, { hrBpm: 150, cadenceRpm: 90 }).last.sample.targetW).toBe(200);
  });
});
