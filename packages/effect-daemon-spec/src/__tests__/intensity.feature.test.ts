import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, TestClock } from 'effect'
import { expect } from 'vitest'
import { BoundedIntensity } from '../daemon-policy.schema.js'
import { make } from '../internal/intensity.js'

const Feature = makeFeature({ it, layer })

Feature('Intensity Tracker')
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'Events below threshold — not exceeded',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=5, window=60s')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 5, window: Duration.seconds(60) })),
        ),
        When('3 events are recorded')(
          'result',
          (s) => Effect.all([s.tracker.record, s.tracker.record, s.tracker.record]),
        ),
        Then('count is 3')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(3)
            })
          ))
        ),
        And('isExceeded is false')((s) =>
          s.tracker.isExceeded.pipe(Effect.flatMap((e) =>
            Effect.sync(() => {
              expect(e).toBe(false)
            })
          ))
        ),
      ),
    )

    scenario(
      'Events above threshold — exceeded',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=3, window=60s')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 3, window: Duration.seconds(60) })),
        ),
        When('4 events are recorded')(
          'result',
          (s) => Effect.all([s.tracker.record, s.tracker.record, s.tracker.record, s.tracker.record]),
        ),
        Then('isExceeded is true')((s) =>
          s.tracker.isExceeded.pipe(Effect.flatMap((e) =>
            Effect.sync(() => {
              expect(e).toBe(true)
            })
          ))
        ),
      ),
    )

    scenario(
      'Exactly at threshold — not exceeded',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=3')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 3, window: Duration.seconds(60) })),
        ),
        When('3 events are recorded')(
          'result',
          (s) => Effect.all([s.tracker.record, s.tracker.record, s.tracker.record]),
        ),
        Then('count is 3')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(3)
            })
          ))
        ),
        And('isExceeded is false')((s) =>
          s.tracker.isExceeded.pipe(Effect.flatMap((e) =>
            Effect.sync(() => {
              expect(e).toBe(false)
            })
          ))
        ),
      ),
    )

    scenario(
      'Old events pruned outside window',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=5, window=10s')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 5, window: Duration.seconds(10) })),
        ),
        When('an event is recorded')('result', (s) => s.tracker.record),
        And('time advances by 11 seconds')(() => TestClock.adjust(Duration.seconds(11))),
        Then('count is 0')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(0)
            })
          ))
        ),
      ),
    )

    scenario(
      'Multiple records within window',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=2')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 2, window: Duration.seconds(60) })),
        ),
        When('3 events are recorded')(
          'result',
          (s) => Effect.all([s.tracker.record, s.tracker.record, s.tracker.record]),
        ),
        Then('count is 3')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(3)
            })
          ))
        ),
        And('isExceeded is true')((s) =>
          s.tracker.isExceeded.pipe(Effect.flatMap((e) =>
            Effect.sync(() => {
              expect(e).toBe(true)
            })
          ))
        ),
      ),
    )

    scenario(
      'Event at window boundary',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=5, window=10s')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 5, window: Duration.seconds(10) })),
        ),
        When('an event is recorded')('result', (s) => s.tracker.record),
        And('time advances by exactly 10 seconds')(() => TestClock.adjust(Duration.seconds(10))),
        Then('count is 1')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(1)
            })
          ))
        ),
      ),
    )

    scenario(
      'All events expire',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=5, window=1s')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 5, window: Duration.seconds(1) })),
        ),
        When('2 events are recorded')('result', (s) => Effect.all([s.tracker.record, s.tracker.record])),
        And('time advances by 2 seconds')(() => TestClock.adjust(Duration.seconds(2))),
        Then('count is 0')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(0)
            })
          ))
        ),
      ),
    )

    scenario(
      'Pruning reflects correct remaining count as window slides',
      Gherkin.Do.pipe(
        Given('a tracker with restarts=3, window=5s')(
          'tracker',
          () => make(new BoundedIntensity({ restarts: 3, window: Duration.seconds(5) })),
        ),
        When('3 events are recorded')(
          'result',
          (s) => Effect.all([s.tracker.record, s.tracker.record, s.tracker.record]),
        ),
        And('time advances by 3 seconds')(() => TestClock.adjust(Duration.seconds(3))),
        Then('count is 3')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(3)
            })
          ))
        ),
        And('isExceeded is false at threshold boundary')((s) =>
          s.tracker.isExceeded.pipe(Effect.flatMap((e) =>
            Effect.sync(() => {
              expect(e).toBe(false)
            })
          ))
        ),
        And('time advances by another 3 seconds')(() => TestClock.adjust(Duration.seconds(3))),
        Then('all events have expired and count is 0')((s) =>
          s.tracker.count.pipe(Effect.flatMap((c) =>
            Effect.sync(() => {
              expect(c).toBe(0)
            })
          ))
        ),
      ),
    )
  })
