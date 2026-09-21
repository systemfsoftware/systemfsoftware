import { runMetamorphicWithShrink } from '@systemfsoftware/differential-spec'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { integers } from './__fixtures__/arbitraries.js'
import { disparityReportOf } from './__fixtures__/disparityReport.js'

const Feature = makeFeature({ it, layer })

Feature('Proving a system obeys a relation when its input is transformed').body(({ scenario }) => {
  scenario(
    'A system whose outputs break the relation is caught with the seed and its follow-up',
    Gherkin.Do.pipe(
      Given('a doubling system whose relation wrongly claims outputs stay equal when the input grows by one')(
        'system',
        () => Effect.succeed((x: number) => Effect.succeed(x * 2)),
      ),
      When('the metamorphic check runs over generated integers')('outcome', (s) =>
        Effect.exit(
          runMetamorphicWithShrink(s.system, integers, (x) => x + 1, (a, b) => a === b),
        )),
      Then('the report names the seed input and its follow-up with both outputs shown')((s) => {
        const report = disparityReportOf(s.outcome)
        expect(report).toContain('seed')
        expect(report).toContain('followUp')
        expect(report).toContain('Output A: 0')
        expect(report).toContain('Output B: 2')
      }),
    ),
  )
})
