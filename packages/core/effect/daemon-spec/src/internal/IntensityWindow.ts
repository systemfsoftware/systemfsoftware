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

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')

  const nowArb = fc.integer({ min: 0, max: 1_000_000 })
  const windowArb = fc.integer({ min: 0, max: 100_000 })
  const stampArb = fc.integer({ min: -1_000_000, max: 1_000_000 })

  /**
   * The window is inclusive: a timestamp exactly windowMillis old is still
   * within, one millisecond older is out.
   */
  it.prop(
    '∀nt_IsWithinWindow_=Inclusive',
    [nowArb, windowArb, stampArb],
    ([now, windowMillis, t]) =>
      isWithinWindow(now, windowMillis)(t) === (now - t <= windowMillis) &&
      isWithinWindow(now, windowMillis)(now - windowMillis) === true,
  )

  /**
   * Pruning keeps exactly the entries still within the window, in original order.
   * Pinned against both the private helper (which owns the filter) and an
   * independent filter expression, so neither side can drift unnoticed.
   */
  it.prop(
    '∀ts_Prune_=KeepWithin',
    [fc.array(stampArb, { maxLength: 16 }), nowArb, windowArb],
    ([ts, now, windowMillis]) => {
      const pruned = pruneTimestamps(ts, now, windowMillis)
      const kept = keepWithin(now, windowMillis)(ts)
      const expected = ts.filter((t) => now - t <= windowMillis)
      return pruned.length === expected.length && pruned.every((t, i) => t === expected[i]) &&
        pruned.every((t, i) => t === kept[i])
    },
  )

  /** Recording prepends now after pruning the expired entries. */
  it.prop(
    '∀ts_Record_=PrependPruned',
    [fc.array(stampArb, { maxLength: 16 }), nowArb, windowArb],
    ([ts, now, windowMillis]) => {
      const recorded = recordTimestamp(ts, now, windowMillis)
      const pruned = pruneTimestamps(ts, now, windowMillis)
      return recorded.length === pruned.length + 1 && recorded[0] === now &&
        recorded.slice(1).every((t, i) => t === pruned[i])
    },
  )

  /** The restart budget trips only strictly past the limit. */
  it.prop(
    '∀cr_Exceeds_=StrictGreater',
    [fc.integer({ min: 0, max: 64 }), fc.integer({ min: 0, max: 64 })],
    ([count, restarts]) =>
      exceedsRestarts(count, restarts) === (count > restarts) && exceedsRestarts(restarts, restarts) === false,
  )
}
