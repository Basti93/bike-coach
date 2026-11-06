import * as L from '../../../src/coach/gym/limits';
import { POLICY_VERSION, ruleNumber } from '../../../src/shared/training-policy';

it("takes every gym limit from the policy register, with today's values", () => {
  expect({ back: L.STEP_BACK, drops: L.DROP_STEP_BACK }).toEqual({ back: 0.9, drops: 2 });
  expect(L.DROP_STEP_BACK).toBe(ruleNumber('gym.drop-step-back-count'));
  expect(L.GYM_POLICY_VERSION).toBe(POLICY_VERSION);
});
