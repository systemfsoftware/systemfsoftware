import { Duration, Effect, Schedule } from 'effect'

/** @public */
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

/** The cap's headroom factor. */
const CAP_MULTIPLIER_MAX = 8

if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { Duration, Effect, Result, Schedule } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  const STEPS_MIN_UNTIL_EXPONENTIAL_EXCEEDS_CAP = 6
  const STEPS_MAX = 12
  const BASE_MS_MAX = 50

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

  describe('cappedBackoff', () => {
    it.prop(
      '∀bcn_CappedBackoffDelay_≤Cap',
      [
        fc.integer({ min: 1, max: BASE_MS_MAX }),
        fc.integer({ min: 1, max: CAP_MULTIPLIER_MAX }),
        fc.integer({ min: STEPS_MIN_UNTIL_EXPONENTIAL_EXCEEDS_CAP, max: STEPS_MAX }),
      ],
      ([baseMs, capMultiplier, steps]) => {
        const capMs = baseMs * capMultiplier
        return delaysMs(baseMs, capMs, steps).every((ms) => ms <= capMs)
      },
    )
  })
}
