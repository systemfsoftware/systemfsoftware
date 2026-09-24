import { DaemonReporter } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect } from 'effect'
import { ReporterSpyContext, SpyLayer } from './__fixtures__/ReporterSpy.js'

const Feature = makeFeature({ it })

Feature('Reporter Observability').withScenarioLayer(SpyLayer).body(({ scenario }) => {
  scenario(
    'Noop reporter succeeds silently',
    Gherkin.Do.pipe(
      Given('a noop reporter')('noop', () => Effect.void),
      When('onRestart is called')('restartExit', (_s) =>
        Effect.gen(function*() {
          const reporter = yield* DaemonReporter
          return yield* Effect.exit(reporter.onRestart('daemon', Cause.die(new Error('boom'))))
        })),
      When('onExhausted is called')('exhaustedExit', (_s) =>
        Effect.gen(function*() {
          const reporter = yield* DaemonReporter
          return yield* Effect.exit(reporter.onExhausted('daemon', Cause.die(new Error('boom'))))
        })),
      Then('no errors are raised')((s, expect) =>
        expect({ restart: s.restartExit, exhausted: s.exhaustedExit }).toMatchObject({
          restart: { _tag: 'Success', value: undefined },
          exhausted: { _tag: 'Success', value: undefined },
        })
      ),
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
      Then('spy recorded exactly one call with name "my-daemon"')((s, expect) =>
        s.spy.getRestarts().pipe(
          Effect.flatMap((restarts) => expect(restarts.map((r) => r.name)).toEqual(['my-daemon'])),
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
      Then('spy recorded exactly one exhausted call')((s, expect) =>
        s.spy.getExhaustions().pipe(
          Effect.flatMap((exhaustions) => expect(exhaustions.map((e) => e.name)).toEqual(['test-daemon'])),
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
      When('onExhausted is called for "daemon-b"')((s) =>
        s.spy.reporter.onExhausted('daemon-b', Cause.die(new Error('error-2')))
      ),
      When('onRestart is called for "daemon-a" again')((s) =>
        s.spy.reporter.onRestart('daemon-a', Cause.die(new Error('error-3')))
      ),
      Then('spy recorded 2 restarts and 1 exhausted in order')((s, expect) =>
        Effect.gen(function*() {
          const restarts = yield* s.spy.getRestarts()
          const exhaustions = yield* s.spy.getExhaustions()
          yield* expect({
            restarts: restarts.map((r) => r.name),
            exhaustions: exhaustions.map((e) => e.name),
          }).toEqual({ restarts: ['daemon-a', 'daemon-a'], exhaustions: ['daemon-b'] })
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
      Then('spy recorded the restart event')((s, expect) =>
        s.spy.getRestarts().pipe(
          Effect.flatMap((restarts) => expect(restarts.map((r) => r.name)).toEqual(['supervisor-1'])),
        )
      ),
    ),
  )
})
