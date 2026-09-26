import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Duration, Effect, Fiber, Layer, Ref, Result, Schedule, type Scope } from 'effect'
import { makeGuestService, OK_REPLY } from './__fixtures__/guest-service.fixture.js'
import { type LawCase, probeStopLaws, type ProbeStopSubject } from './__fixtures__/probe-stop-laws.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080
const HEALTH_PATH = '/health'
const POLL_SPACING = Duration.millis(2)
const SETTLE_LIMIT = Duration.seconds(5)

const bindingOf = (hostPort: number): Readiness.PortBinding => ({ guest: GUEST_PORT, host: '127.0.0.1', hostPort })

const realSubject: Effect.Effect<ProbeStopSubject, never, Scope.Scope> = Effect.gen(function*() {
  const answering = yield* makeGuestService(OK_REPLY)
  const silent = yield* makeGuestService(OK_REPLY)
  yield* silent.silence
  const ledger = yield* Ref.make<ReadonlyArray<number>>([])
  const heldOpen = Effect.map(
    Effect.all([answering.openConnections, silent.openConnections]),
    ([answered, held]) => answered + held,
  )
  const through = <A, E>(body: Effect.Effect<A, E, Readiness.HostProber>) =>
    Effect.provide(body, Readiness.NodeHostProber.layer)
  const settleTo = (before: number) =>
    Effect.asVoid(
      Effect.repeat(heldOpen, {
        schedule: Schedule.spaced(POLL_SPACING),
        until: (held) => held <= before,
      }),
    ).pipe(Effect.timeoutOption(SETTLE_LIMIT))
  return {
    dial: through(Effect.flatMap(Readiness.HostProber, (prober) => prober.dial(bindingOf(answering.hostPort)))),
    exchange: through(
      Effect.flatMap(Readiness.HostProber, (prober) => prober.exchange(bindingOf(answering.hostPort), HEALTH_PATH)),
    ),
    inFlight: through(
      Effect.flatMap(Readiness.HostProber, (prober) => prober.exchange(bindingOf(silent.hostPort), HEALTH_PATH)),
    ),
    run: (body) =>
      Effect.scoped(Effect.gen(function*() {
        const before = yield* heldOpen
        yield* Effect.addFinalizer(() =>
          Effect.andThen(
            settleTo(before),
            Effect.flatMap(heldOpen, (after) => Ref.update(ledger, (entries) => [...entries, after - before])),
          )
        )
        return yield* body
      })),
    kill: (fiber) => Effect.asVoid(Fiber.interrupt(fiber)),
    release: () => Effect.void,
    heldOpen,
    endedRuns: Effect.map(
      Ref.get(ledger),
      (entries) => ({ ended: entries.length, leftOpen: entries.reduce((total, delta) => total + delta, 0) }),
    ),
  }
})

const [ordinaryRun, stoppedInFlight, restartedAfterStop, killedMidCall] = probeStopLaws(realSubject)

const verdictOf = (law: LawCase): Effect.Effect<string> =>
  Effect.map(
    Effect.result(law.check),
    (outcome) =>
      Result.match(outcome, {
        onFailure: (failure) => `${failure.law}: broken — ${failure.why}`,
        onSuccess: () => 'holds',
      }),
  )

const lawPipeline = (event: string, law: LawCase) =>
  Gherkin.Do.pipe(
    When(event)('verdict', () => verdictOf(law)),
    Then('the law holds for the real prober')((state, expect) => expect(state.verdict).toEqual('holds')),
  )

Feature('The real prober obeys the probe stop laws against a loopback guest service', { timeout: 0 })
  .live('the laws dial, hold and stop real loopback sockets the simulation kernel cannot drive')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An ordinary run answers on the live endpoint and leaves nothing open',
      lawPipeline('a wait dials and exchanges with the guest behind the mapped port', ordinaryRun),
    )

    scenario(
      'A run stopped while its call is in flight leaves nothing open',
      lawPipeline('a wait is stopped while its exchange with the guest is in flight', stoppedInFlight),
    )

    scenario(
      'A run started after a stop still answers on the live endpoint',
      lawPipeline('a wait is started again against the same guest after a stop', restartedAfterStop),
    )

    scenario(
      'A run killed mid-call is not blamed and the endpoint lets it go',
      lawPipeline('a wait is killed while its exchange with the guest is in flight', killedMidCall),
    )
  })
