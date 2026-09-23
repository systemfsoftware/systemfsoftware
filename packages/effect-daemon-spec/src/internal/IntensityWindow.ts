import { Function } from 'effect'

/** @internal */
export const isWithinWindow: {
  (now: number, windowMillis: number): (t: number) => boolean
  (t: number, now: number, windowMillis: number): boolean
} = Function.dual(3, (t: number, now: number, windowMillis: number): boolean => now - t <= windowMillis)

const keepWithin = (now: number, windowMillis: number) =>
(
  ts: readonly number[],
): readonly number[] => ts.filter(isWithinWindow(now, windowMillis))

/** @internal */
export const pruneTimestamps: {
  (now: number, windowMillis: number): (ts: readonly number[]) => readonly number[]
  (ts: readonly number[], now: number, windowMillis: number): readonly number[]
} = Function.dual(
  3,
  (ts: readonly number[], now: number, windowMillis: number): readonly number[] => keepWithin(now, windowMillis)(ts),
)

/** @internal */
export const recordTimestamp: {
  (now: number, windowMillis: number): (ts: readonly number[]) => readonly number[]
  (ts: readonly number[], now: number, windowMillis: number): readonly number[]
} = Function.dual(
  3,
  (
    ts: readonly number[],
    now: number,
    windowMillis: number,
  ): readonly number[] => [now, ...pruneTimestamps(ts, now, windowMillis)],
)

/** @internal */
export const exceedsRestarts: {
  (restarts: number): (count: number) => boolean
  (count: number, restarts: number): boolean
} = Function.dual(2, (count: number, restarts: number): boolean => count > restarts)
