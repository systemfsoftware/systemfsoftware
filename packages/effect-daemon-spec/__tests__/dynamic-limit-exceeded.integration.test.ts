import { And, Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { DynamicLimitExceeded } from '../src/mod.js'

const Feature = makeFeature({ it, layer })

Feature('DynamicLimitExceeded error')
  .body(({ scenario }) => {
    scenario(
      'DynamicLimitExceeded has limit and _tag fields',
      Gherkin.Do.pipe(
        Given('a DynamicLimitExceeded error with limit 42')(
          'err',
          () => Effect.sync(() => new DynamicLimitExceeded({ limit: 42 })),
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
