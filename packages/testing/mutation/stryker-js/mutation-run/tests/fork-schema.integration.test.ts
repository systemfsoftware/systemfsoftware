import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

import { forkOptionsSchema } from '../src/config/fork-schema.schema.js'

const Feature = makeFeature({ it, layer })

Feature('fork schema requireTestContribution defaults').body(({ scenario }) => {
  scenario(
    'Should_YieldWorkflowSuffix_When_RequireTestContributionOmitted',
    Gherkin.Do.pipe(
      Given('an empty option document')('input', () => Effect.succeed({})),
      When('decoded via forkOptionsSchema')(
        'decoded',
        (s) => Effect.sync(() => S.decodeUnknownSync(forkOptionsSchema)(s.input)),
      ),
      Then('the default is the single workflow suffix')((s) => {
        expect(s.decoded.requireTestContribution).toEqual(['.workflow.property.test.ts'])
      }),
    ),
  )

  scenario(
    'Should_RoundTripExplicitArray_When_RequireTestContributionSetToMultiple',
    Gherkin.Do.pipe(
      Given('a document declaring multiple suffixes')('input', () =>
        Effect.succeed({
          requireTestContribution: [
            '.workflow.property.test.ts',
            '.other.property.test.ts',
            '.another.property.test.ts',
          ],
        })),
      When('decoded via forkOptionsSchema')(
        'decoded',
        (s) => Effect.sync(() => S.decodeUnknownSync(forkOptionsSchema)(s.input)),
      ),
      Then('the explicit array round-trips unchanged')((s) => {
        expect(s.decoded.requireTestContribution).toEqual([
          '.workflow.property.test.ts',
          '.other.property.test.ts',
          '.another.property.test.ts',
        ])
      }),
    ),
  )

  scenario(
    'Should_YieldNull_When_RequireTestContributionExplicitlyNull',
    Gherkin.Do.pipe(
      Given('a document disabling the check')('input', () => Effect.succeed({ requireTestContribution: null })),
      When('decoded via forkOptionsSchema')(
        'decoded',
        (s) => Effect.sync(() => S.decodeUnknownSync(forkOptionsSchema)(s.input)),
      ),
      Then('null is preserved and the check is disabled')((s) => {
        expect(s.decoded.requireTestContribution).toBeNull()
      }),
    ),
  )
})
