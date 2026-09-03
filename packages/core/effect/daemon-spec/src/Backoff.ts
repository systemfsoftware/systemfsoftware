import { Duration, Effect, Result, Schedule } from 'effect'
import { FastCheck as fc } from 'effect/testing'

export const cappedBackoff = (
  base: Duration.Input,
  cap: Duration.Input,
): Schedule.Schedule<Duration.Duration> => {
  const ceiling = Duration.fromInputUnsafe(cap)
  return Schedule.exponential(base).pipe(
    Schedule.jittered,
    Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, ceiling))),
  )
}

const delaysMs = (baseMs: number, capMs: number, steps: number): readonly number[] =>
  Effect.runSync(
    Effect.gen(function*() {
      const step = yield* Schedule.toStep(cappedBackoff(Duration.millis(baseMs), Duration.millis(capMs)))
      const out: number[] = []
      let now = 0
      for (let i = 1; i <= steps; i++) {
        const stepped = yield* Effect.result(step(now, void 0))
        if (Result.isFailure(stepped)) break
        const [, delay] = stepped.success
        out.push(Duration.toMillis(delay))
        now += Duration.toMillis(delay)
      }
      return out
    }),
  )

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀bcn_CappedBackoffDelay_≤Cap',
    [fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 8 }), fc.integer({ min: 6, max: 12 })],
    ([baseMs, capMultiplier, steps]) => {
      const capMs = baseMs * capMultiplier
      return delaysMs(baseMs, capMs, steps).every((ms) => ms <= capMs)
    },
  )
}
