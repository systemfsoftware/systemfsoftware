import { expect } from '@effect/vitest'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import type { ProvidedContext } from 'vitest'
import { messagesOf, runProbes } from './support/run-fixtures'

const Feature = makeFeature({ it, layer })

const INHERITS = 'property-budget/inherits.test.ts'
const OVERRIDE = 'property-budget/override.test.ts'
const PROVIDED_RUNS = 'Should_RunTheProvidedBudget_When_RunsIsOmitted'
const EXPLICIT_RUNS = 'Should_RunTheExplicitBudget_When_RunsIsGiven'
const FALSIFIED = 'Should_Falsify_When_TheSubjectKeepsLargeValues'

const CHECK_DEFAULTS = '@systemfsoftware/vitest:property-check'

const configured = (value: { readonly runs: number; readonly maxShrinks?: number }): Partial<ProvidedContext> => ({
  [CHECK_DEFAULTS]: value,
})

const reportOf = (globs: ReadonlyArray<string>, provide?: Partial<ProvidedContext>) =>
  runProbes({ globs, ...(provide === undefined ? {} : { provide }) }).pipe(Effect.map((run) => run.report))

Feature('Configuring how many times properties run')
  .body(({ scenario }) => {
    scenario(
      'A property with no budget of its own runs the configured number of times',
      Gherkin.Do.pipe(
        Given('a run that configures seven draws')(
          'report',
          () => reportOf([INHERITS], configured({ runs: 7 })),
        ),
        Then('the property is reported as having run seven times')((s) => {
          expect(messagesOf(s.report, PROVIDED_RUNS)).toContain('0/7')
        }),
      ),
    )

    scenario(
      'A property with no budget of its own and no configured size runs a hundred times',
      Gherkin.Do.pipe(
        Given('a run that configures nothing')('report', () => reportOf([INHERITS])),
        Then('the property is reported as having run a hundred times')((s) => {
          expect(messagesOf(s.report, PROVIDED_RUNS)).toContain('0/100')
        }),
      ),
    )

    scenario(
      'A property with its own budget runs that many times and keeps the configured shrink cap',
      Gherkin.Do.pipe(
        Given('a run that configures seven draws and no shrinking')(
          'capped',
          () => reportOf([OVERRIDE], configured({ runs: 7, maxShrinks: 0 })),
        ),
        When('the same suite runs with the shrinking left alone')(
          'uncapped',
          () => reportOf([OVERRIDE], configured({ runs: 7 })),
        ),
        Then('the property reports its own three draws and the configured cap holds')((s) => {
          expect(messagesOf(s.capped, EXPLICIT_RUNS)).toContain('0/3')
          expect(messagesOf(s.capped, FALSIFIED)).toContain('0 shrink(s)')
          expect(messagesOf(s.uncapped, FALSIFIED)).not.toContain('0 shrink(s)')
        }),
      ),
    )

    scenario(
      'A configured budget that is not a positive count is refused, naming the configuration key',
      Gherkin.Do.pipe(
        Given('a run that configures zero draws')(
          'report',
          () => reportOf([INHERITS], configured({ runs: 0 })),
        ),
        Then('the property fails and names the configuration key')((s) => {
          const messages = messagesOf(s.report, PROVIDED_RUNS)
          expect(messages).toContain(CHECK_DEFAULTS)
          expect(messages).toContain('positive integer')
        }),
      ),
    )
  })
