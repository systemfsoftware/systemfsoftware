import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Result, Schedule } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { cappedBackoff } from '../backoff.kernel.js'

const CAP_MULTIPLIER_MAX = 8
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
