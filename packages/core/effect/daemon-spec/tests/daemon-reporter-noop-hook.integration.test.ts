import { DaemonReporter, Noop } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect } from 'effect'

const Feature = makeFeature({ it, layer })

Feature('Daemon reporter Noop hook shape')
  .withLayer(Noop)
  .body(({ scenario }) => {
    scenario(
      'Noop onRestart and onExhausted return finishable Effects',
      Gherkin.Do.pipe(
        Given('the noop reporter service')('_', () => Effect.void),
        When('both hooks are invoked')('_', () =>
          Effect.gen(function*() {
            const reporter = yield* DaemonReporter
            yield* reporter.onRestart('noop-check', Cause.empty)
            yield* reporter.onExhausted('noop-check', Cause.empty)
          })),
        Then('no failure is raised')((_s) => Effect.void),
      ),
    )
  })
