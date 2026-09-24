import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import type { ProvidedContext } from 'vitest'
import { messagesOf, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const INHERITS = 'property-budget/inherits.property.test.ts'
const OVERRIDE = 'property-budget/override.property.test.ts'
const PROVIDED_RUNS = '∀n_RunTheProvidedBudget_=Configured'
const EXPLICIT_RUNS = '∀n_RunTheExplicitBudget_=Given'
const FALSIFIED = '∀n_KeepsLargeValues_⊥Small'

const CHECK_DEFAULTS = '@systemfsoftware/vitest:property-check'

const configured = (value: { readonly runs: number; readonly maxShrinks?: number }): Partial<ProvidedContext> => ({
  [CHECK_DEFAULTS]: value,
})

const reportOf = (globs: ReadonlyArray<string>, provide?: Partial<ProvidedContext>) =>
  runProbes({ globs, ...(provide === undefined ? {} : { provide }) }).pipe(Effect.map((run) => run.report))

Feature('Configuring how many times properties run')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
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
