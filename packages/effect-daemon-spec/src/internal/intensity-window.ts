export const isWithinWindow = (now: number, windowMillis: number) => (t: number): boolean => now - t <= windowMillis

export const pruneTimestamps = (
  ts: ReadonlyArray<number>,
  now: number,
  windowMillis: number,
): ReadonlyArray<number> => ts.filter(isWithinWindow(now, windowMillis))

export const recordTimestamp = (
  ts: ReadonlyArray<number>,
  now: number,
  windowMillis: number,
): ReadonlyArray<number> => [now, ...pruneTimestamps(ts, now, windowMillis)]

export const exceedsRestarts = (count: number, restarts: number): boolean => count > restarts
