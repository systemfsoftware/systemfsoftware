import { Gherkin, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { afterAll, expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const executions = { ran: 0 }

const Feature = makeFeature({ it })

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
