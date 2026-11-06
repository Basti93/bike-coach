import * as L from '../../../src/coach/gym/limits';
import { POLICY_VERSION, ruleNumber, ruleRange } from '../../../src/shared/training-policy';

it("takes every gym limit from the policy register, with today's values", () => {
  expect([L.REP_MIN, L.REP_MAX]).toEqual([ruleRange('gym.rep-range').min, ruleRange('gym.rep-range').max]);
  expect({ step: L.MIN_STEP_KG, pct: L.MAX_STEP_PCT, back: L.STEP_BACK, effort: L.EFFORT_STEP_BACK })
    .toEqual({ step: 2.5, pct: 5, back: 0.9, effort: 3 });
  expect(L.EFFORT_STEP_BACK).toBe(ruleNumber('gym.effort-step-back-count'));
  expect(L.GYM_POLICY_VERSION).toBe(POLICY_VERSION);
});
