/** @internal */
export const isWithinWindow = (now: number, windowMillis: number) => (t: number): boolean => now - t <= windowMillis

const keepWithin = (now: number, windowMillis: number) =>
(
  ts: readonly number[],
): readonly number[] => ts.filter(isWithinWindow(now, windowMillis))

/** @internal */
export const pruneTimestamps = (
  ts: readonly number[],
  now: number,
  windowMillis: number,
): readonly number[] => keepWithin(now, windowMillis)(ts)

/** @internal */
export const recordTimestamp = (
  ts: readonly number[],
  now: number,
  windowMillis: number,
): readonly number[] => [now, ...pruneTimestamps(ts, now, windowMillis)]

/** @internal */
export const exceedsRestarts = (count: number, restarts: number): boolean => count > restarts
