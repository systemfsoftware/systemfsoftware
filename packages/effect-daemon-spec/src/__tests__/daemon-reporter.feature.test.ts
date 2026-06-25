import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Duration, Effect, Layer, Option, Schedule, TestClock } from 'effect'
import { expect } from 'vitest'
import { BoundedIntensity } from '../daemon-policy.schema.js'
import { DaemonReporter } from '../daemon-reporter.js'
import { Daemon } from '../daemon.js'
import { LeaderLock } from '../leader-lock.js'
import { run } from '../run.js'
import { Supervision } from '../supervision-preset.js'
import { oneForOne } from '../supervisor.js'
import { ReporterSpyContext, SpyLayer } from './helpers/reporter-spy.js'

const Feature = makeFeature({ it, layer })

const NoopHookFeature = makeFeature({ it, layer })

NoopHookFeature('Daemon reporter Noop hook shape')
  .withLayer(DaemonReporter.Noop)
  .body(({ scenario }) => {
    scenario(
      'Noop onRestart and onExhausted return finishable Effects',
      Gherkin.Do.pipe(
        Given('the noop reporter service')('_', () => Effect.void),
        When('both hooks are invoked')('_', () =>
          Effect.gen(function*() {
            const reporter = yield* DaemonReporter
            const restartEff = reporter.onRestart('noop-check', Cause.empty)
            const exhaustedEff = reporter.onExhausted('noop-check', Cause.empty)
            expect(Effect.isEffect(restartEff)).toBe(true)
            expect(Effect.isEffect(exhaustedEff)).toBe(true)
            yield* Effect.all([restartEff, exhaustedEff], { concurrency: 'unbounded' })
          })),
        Then('no failure is raised')((_s) => Effect.void),
      ),
    )
  })

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

Feature('Supervisor exhaustion via DaemonReporter')
  .withLayer(LeaderLock.Noop)
  .withScenarioLayer(TestClock.defaultTestClock)
  .body(({ scenario }) => {
    scenario(
      'persistent child failure exhausts supervisor, closes healthy, and reports onExhausted once',
      Gherkin.Do.pipe(
        Given('noop')('_', () => Effect.void),
        When('a zero-restart supervisor wraps a failing poll worker')('out', () =>
          Effect.gen(function*() {
            const spy = yield* ReporterSpyContext
            const reporterLayer = Layer.mergeAll(LeaderLock.Noop, Layer.succeed(DaemonReporter, spy.reporter))
            const worker = Daemon.poll({
              name: 'persist-fail',
              work: Effect.fail('boom'),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: 'exhaust-sup',
              children: [worker],
              supervision: Supervision.custom({
                intensity: new BoundedIntensity({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(1), 1),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const supHealth = yield* run.supervisor(sup).pipe(Effect.provide(reporterLayer))
            yield* TestClock.adjust(Duration.seconds(2))
            const healthyOpen = yield* supHealth.healthy.await.pipe(
              Effect.timeout('0 millis'),
              Effect.matchEffect({
                onFailure: () => Effect.succeed(false),
                onSuccess: () => Effect.succeed(true),
              }),
            )
            const exhaustions = yield* spy.getExhaustions()
            return { healthyOpen, exhaustions }
          })),
        Then('healthy latch is closed and spy records one exhaustion for the supervisor')((s) =>
          Effect.sync(() => {
            expect(s.out.healthyOpen).toBe(false)
            expect(s.out.exhaustions).toHaveLength(1)
            const exhaustion = Option.getOrThrowWith(
              Option.fromNullable(s.out.exhaustions[0]),
              () => new Error('expected one supervisor exhaustion event'),
            )
            expect(exhaustion.name).toBe('exhaust-sup')
            expect(Cause.isDie(exhaustion.cause)).toBe(true)
          })
        ),
      ),
    )
  })
