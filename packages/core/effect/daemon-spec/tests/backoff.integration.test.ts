import { cappedBackoff } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Result, Schedule } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const delaysMs = (baseMs: number, capMs: number, steps: number) =>
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
  })

Feature('Capped Backoff')
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Base <baseMs>ms ×<capMultiplier> over <steps> steps never exceeds the cap',
      [
        { baseMs: 1, capMultiplier: 8, steps: 12 },
        { baseMs: 10, capMultiplier: 4, steps: 10 },
        { baseMs: 50, capMultiplier: 2, steps: 8 },
        { baseMs: 7, capMultiplier: 8, steps: 6 },
      ],
      (row) =>
        Gherkin.Do.pipe(
          When('the schedule is stepped')('delays', () =>
            delaysMs(row.baseMs, row.baseMs * row.capMultiplier, row.steps)),
          Then('every delay is within the cap')((s) =>
            Effect.sync(() => {
              expect(Math.max(...s.delays)).toBeLessThanOrEqual(row.baseMs * row.capMultiplier)
            })
          ),
        ),
    )
  })
