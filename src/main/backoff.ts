const BASE_MS = 250;
const MAX_MS = 30_000;
export const restartDelayMs = (consecutiveFailures: number): number => Math.min(MAX_MS, BASE_MS * 2 ** consecutiveFailures);
