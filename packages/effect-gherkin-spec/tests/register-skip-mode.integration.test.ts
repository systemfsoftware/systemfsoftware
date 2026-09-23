import { Gherkin, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { afterAll, expect } from 'vitest'

const executions = { ran: 0 }

const Feature = makeFeature({ it, layer })

Feature.skip('A suite registered in skip mode is not executed')
  .body(({ scenario }) => {
    scenario(
      'A scenario of a skipped suite never runs its steps',
      Gherkin.Do.pipe(
        Then('this step records an execution whenever it actually runs')(() =>
          Effect.sync(() => {
            executions.ran += 1
          })
        ),
      ),
    )
  })

afterAll(() => {
  expect(executions.ran).toBe(0)
})
