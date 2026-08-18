import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect } from 'effect'
import { expect } from 'vitest'
import { DaemonReporter } from '../src/DaemonReporterAdapter.js'
import { ReporterSpyContext, SpyLayer } from './__fixtures__/ReporterSpy.js'

const Feature = makeFeature({ it, layer })

Feature('Reporter Observability').withScenarioLayer(SpyLayer).body(({ scenario }) => {
  scenario(
    'Noop reporter succeeds silently',
    Gherkin.Do.pipe(
      Given('a noop reporter')('noop', () => Effect.void),
      When('onRestart is called')('_', (_s) =>
        Effect.gen(function*() {
          const reporter = yield* DaemonReporter
          yield* reporter.onRestart('daemon', Cause.die(new Error('boom')))
        })),
      And('onExhausted is called')((_s) =>
        Effect.gen(function*() {
          const reporter = yield* DaemonReporter
          yield* reporter.onExhausted('daemon', Cause.die(new Error('boom')))
        })
      ),
      Then('no errors are raised')((_s) => Effect.void),
    ),
  )

  scenario(
    'onRestart invoked with correct args',
    Gherkin.Do.pipe(
      Given('a daemon reporter spy')('spy', () => ReporterSpyContext),
      When('onRestart is called with name "my-daemon"')(
        'result',
        (s) => s.spy.reporter.onRestart('my-daemon', Cause.die(new Error('test'))),
      ),
      Then('spy recorded exactly one call with name "my-daemon"')((s) =>
        s.spy.getRestarts().pipe(
          Effect.flatMap((restarts) =>
            Effect.sync(() => {
              expect(restarts).toHaveLength(1)
              expect(restarts[0]?.name).toBe('my-daemon')
            })
          ),
        )
      ),
    ),
  )

  scenario(
    'onExhausted invoked with correct args',
    Gherkin.Do.pipe(
      Given('a daemon reporter spy')('spy', () => ReporterSpyContext),
      When('onExhausted is called with name "test-daemon"')(
        'result',
        (s) => s.spy.reporter.onExhausted('test-daemon', Cause.die(new Error('exhausted'))),
      ),
      Then('spy recorded exactly one exhausted call')((s) =>
        s.spy.getExhaustions().pipe(
          Effect.flatMap((exhaustions) =>
            Effect.sync(() => {
              expect(exhaustions).toHaveLength(1)
              expect(exhaustions[0]?.name).toBe('test-daemon')
            })
          ),
        )
      ),
    ),
  )

  scenario(
    'Multiple events from different daemons',
    Gherkin.Do.pipe(
      Given('a daemon reporter spy')('spy', () => ReporterSpyContext),
      When('onRestart is called for "daemon-a"')(
        'result',
        (s) => s.spy.reporter.onRestart('daemon-a', Cause.die(new Error('error-1'))),
      ),
      And('onExhausted is called for "daemon-b"')((s) =>
        s.spy.reporter.onExhausted('daemon-b', Cause.die(new Error('error-2')))
      ),
      And('onRestart is called for "daemon-a" again')((s) =>
        s.spy.reporter.onRestart('daemon-a', Cause.die(new Error('error-3')))
      ),
      Then('spy recorded 2 restarts and 1 exhausted in order')((s) =>
        Effect.gen(function*() {
          const restarts = yield* s.spy.getRestarts()
          const exhaustions = yield* s.spy.getExhaustions()
          expect(restarts).toHaveLength(2)
          expect(exhaustions).toHaveLength(1)
          expect(restarts[0]?.name).toBe('daemon-a')
          expect(exhaustions[0]?.name).toBe('daemon-b')
          expect(restarts[1]?.name).toBe('daemon-a')
        })
      ),
    ),
  )

  scenario(
    'Per-supervisor hooks fire alongside global',
    Gherkin.Do.pipe(
      Given('a daemon reporter spy')('spy', () => ReporterSpyContext),
      When('onRestart is called for "supervisor-1"')(
        'result',
        (s) => s.spy.reporter.onRestart('supervisor-1', Cause.die(new Error('supervisor-restart'))),
      ),
      Then('spy recorded the restart event')((s) =>
        s.spy.getRestarts().pipe(
          Effect.flatMap((restarts) =>
            Effect.sync(() => {
              expect(restarts).toHaveLength(1)
              expect(restarts[0]?.name).toBe('supervisor-1')
            })
          ),
        )
      ),
    ),
  )
})
