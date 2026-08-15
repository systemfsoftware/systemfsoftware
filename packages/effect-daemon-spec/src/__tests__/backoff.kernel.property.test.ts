import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Array, Chunk, Duration, Effect, FastCheck as fc, Schedule } from 'effect'
import { cappedBackoff } from '../backoff.kernel.js'

const CAP_MULTIPLIER_MAX = 8
const STEPS_MIN_UNTIL_EXPONENTIAL_EXCEEDS_CAP = 6
const STEPS_MAX = 12
const BASE_MS_MAX = 50

const delaysMs = (baseMs: number, capMs: number, steps: number): readonly number[] =>
  Chunk.toReadonlyArray(
    Effect.runSync(
      Schedule.run(
        Schedule.delays(cappedBackoff(Duration.millis(baseMs), Duration.millis(capMs))),
        0,
        Array.range(1, steps),
      ),
    ),
  ).map(Duration.toMillis)

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
