import { DynamicLimitExceeded } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
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
        Then('limit is 42 and the tag is "DynamicLimitExceeded"')((s, expect) =>
          expect(s.err).toMatchObject({ _tag: 'DynamicLimitExceeded', limit: 42 })
        ),
      ),
    )
  })
