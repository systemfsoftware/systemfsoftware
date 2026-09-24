import { DaemonReporter, Noop } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect } from 'effect'

const Feature = makeFeature({ it })

Feature('Daemon reporter Noop hook shape')
  .withLayer(Noop)
  .body(({ scenario }) => {
    scenario(
      'Noop onRestart and onExhausted return finishable Effects',
      Gherkin.Do.pipe(
        Given('the noop reporter service')('_', () => Effect.void),
        When('both hooks are invoked')('exits', () =>
          Effect.gen(function*() {
            const reporter = yield* DaemonReporter
            const onRestart = yield* Effect.exit(reporter.onRestart('noop-check', Cause.empty))
            const onExhausted = yield* Effect.exit(reporter.onExhausted('noop-check', Cause.empty))
            return { onRestart, onExhausted }
          })),
        Then('no failure is raised')((s, expect) =>
          expect(s.exits).toMatchObject({
            onRestart: { _tag: 'Success', value: undefined },
            onExhausted: { _tag: 'Success', value: undefined },
          })
        ),
      ),
    )
  })
