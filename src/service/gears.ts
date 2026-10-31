export const MIN_GEAR = 1;
export const MAX_GEAR = 12;
export const NEUTRAL_GEAR = 6;
const MIN_GRADE = -10;
const MAX_GRADE = 20;

export const effectiveGrade = (gradePct: number, scale: number, gear: number, gradePerGear: number): number =>
  Math.min(MAX_GRADE, Math.max(MIN_GRADE, gradePct * scale + (gear - NEUTRAL_GEAR) * gradePerGear));
