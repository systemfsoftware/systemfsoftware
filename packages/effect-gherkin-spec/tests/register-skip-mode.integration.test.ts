import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const executions = { ran: 0 }

const Feature = makeFeature({ it })

Feature.skip('A suite registered in skip mode is not executed')
  .body(({ scenario }) => {
    scenario(
      'A scenario of a skipped suite never runs its steps',
      Gherkin.Do.pipe(
        When('the step records an execution whenever it actually runs')(() =>
          Effect.sync(() => {
            executions.ran += 1
          })
        ),
        Then('this scenario performed exactly the one execution it recorded')((_s, expect) =>
          expect(executions.ran).toBe(1)
        ),
      ),
    )
  })

it('A skipped suite never ran any of its steps', function*({ expect }) {
  yield* expect(executions.ran).toBe(0)
})
