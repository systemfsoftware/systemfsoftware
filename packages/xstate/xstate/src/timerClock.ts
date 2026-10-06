import type { LogicalTimer } from './types.js'

// Runtime metadata stays outside pure snapshots. Timer objects survive unrelated
// transitions; a cancelled/replaced timer gets a new object and a new deadline.
const starts = new WeakMap<LogicalTimer, number>()

/** @internal */
export function getTimerStart(timer: LogicalTimer): number | undefined {
  return starts.get(timer) ?? timer.startedAt
}

/** @internal */
export function recordTimerStart(timer: LogicalTimer, startedAt: number): void {
  starts.set(timer, startedAt)
}
