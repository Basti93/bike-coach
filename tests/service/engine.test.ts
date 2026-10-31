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
