import { expect } from '@effect/vitest'
import { DynamicLimitExceeded } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

const Feature = makeFeature({ it })

Feature('DynamicLimitExceeded error')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'DynamicLimitExceeded has limit and _tag fields',
      Gherkin.Do.pipe(
        Given('a DynamicLimitExceeded error with limit 42')(
          'err',
          () => Effect.sync(() => DynamicLimitExceeded.make({ limit: 42 })),
        ),
        Then('limit is 42')((s) =>
          Effect.sync(() => {
            expect(s.err.limit).toBe(42)
          })
        ),
        And('_tag is "DynamicLimitExceeded"')((s) =>
          Effect.sync(() => {
            expect(s.err._tag).toBe('DynamicLimitExceeded')
          })
        ),
      ),
    )
  })
