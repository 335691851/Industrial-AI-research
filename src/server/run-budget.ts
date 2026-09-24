// Keep the existing 255s execution ceiling within the route's 300s limit.
export const RUN_BUDGET_MS = 255000;
export function phaseBudget(started: number, deadlineMs: number, now = Date.now()) {
  return Math.max(0, deadlineMs - (now - started));
}
export function phaseSignal(parent: AbortSignal, started: number, deadlineMs: number) {
  return AbortSignal.any([parent, AbortSignal.timeout(phaseBudget(started, deadlineMs))]);
}
