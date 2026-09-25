import { Conformance } from '@systemfsoftware/conformance-spec'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Cause, Deferred, Effect, Layer, Match, Option, Ref, Schema, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import { type MemoryTransport, memoryTransport } from './__fixtures__/memory-transport.fixture.js'

const Feature = makeFeature({ it })

const GREETING = 'socket-medium-greeting'
const ECHO = 'socket-medium-echo'

/** The steps the release check stopped at, or zero when the check did not pass. */
const stoppedStepsOf = (report: Conformance.Report<never, never>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => 0),
  )

const mediumEnvironment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

const echoing = (
  read: Deferred.Deferred<void>,
): (connection: SocketMedium.SocketConnection) => Effect.Effect<void, never, never> =>
(connection) =>
  Stream.runForEach(
    connection.frames,
    () => Effect.andThen(Effect.orDie(connection.send(ECHO)), Deferred.succeed(read, undefined)),
  ).pipe(Effect.orDie)

type PortShape = Supervisor.Medium.MediumPortShape<SocketMedium.SocketProgram, never, Scope.Scope>

interface Notes {
  readonly failures: Ref.Ref<Option.Option<string>>
  readonly ending: Ref.Ref<Option.Option<string>>
}

const recordedFailure = (notes: Notes) => (cause: Cause.Cause<never>) =>
  Cause.hasInterruptsOnly(cause)
    ? Effect.failCause(cause)
    : Ref.set(notes.failures, Option.some(Cause.pretty(cause)))

const lifeAgainst = (
  program: SocketMedium.SocketProgram,
  read: Deferred.Deferred<void>,
  greet: Effect.Effect<void>,
  notes: Notes,
): Effect.Effect<void, never, PortShape> =>
  Effect.scoped(
    Effect.gen(function*() {
      const { medium } = yield* SocketMedium.port
      const peek = yield* Effect.serviceOption(SocketMedium.Dialer)
      yield* Ref.set(notes.ending, Option.some(Option.isSome(peek) ? 'dialer-present' : 'dialer-absent'))
      const started = yield* medium.start(program)
      yield* greet
      yield* Deferred.await(read)
      yield* started.ready
      yield* medium.stop(started, { _tag: 'Brutal' })
      yield* Effect.flatMap(medium.report(started), (reason) =>
        Ref.set(
          notes.ending,
          Option.some(
            Match.value(reason).pipe(
              Match.tag('Normal', () => 'Normal'),
              Match.tag('Shutdown', () => 'Shutdown'),
              Match.orElse(() => 'Abnormal'),
            ),
          ),
        ))
    }),
  ).pipe(Effect.catchCause(recordedFailure(notes)))

const againstTheMemoryPeer = (peer: MemoryTransport, notes: Notes): Effect.Effect<void, never, never> =>
  Effect.gen(function*() {
    const read = yield* Deferred.make<void>()
    yield* Effect.provideService(
      Effect.provide(
        lifeAgainst(
          { address: { host: '127.0.0.1', port: 65_000 }, ready: Readiness.Wait.forLog(GREETING), run: echoing(read) },
          read,
          peer.greet(GREETING),
          notes,
        ),
        mediumEnvironment,
      ),
      SocketMedium.Dialer,
      peer,
    )
  })

const checkedAgainstTheMemoryPeer = (
  peer: MemoryTransport,
  notes: Notes,
): Effect.Effect<Conformance.Report<never, never>, never> =>
  Conformance.released(againstTheMemoryPeer(peer, notes), { probe: peer.released })

const failureOf = (notes: Notes): Effect.Effect<Option.Option<string>> => Ref.get(notes.failures)

const endingOf = (notes: Notes): Effect.Effect<Option.Option<string>> => Ref.get(notes.ending)

const oracleLife = (peer: MemoryTransport, notes: Notes): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const read = yield* Deferred.make<void>()
    const oracle = yield* Effect.provideService(
      Effect.orDie(SocketMedium.makeLoopbackServer),
      SocketMedium.LoopbackListener,
      peer,
    )
    yield* oracle.advance({ _tag: 'BecomeReady' }, 0)
    yield* oracle.advance({ _tag: 'BecomeReady' }, 0)
    yield* Effect.provideService(
      Effect.provide(
        lifeAgainst(
          {
            address: oracle.address,
            ready: Readiness.Wait.forLog(SocketMedium.READY_FRAME),
            run: echoing(read),
          },
          read,
          Effect.void,
          notes,
        ),
        mediumEnvironment,
      ),
      SocketMedium.Dialer,
      peer,
    )
  })

const checkedAgainstTheLoopbackOracle = (
  peer: MemoryTransport,
  notes: Notes,
): Effect.Effect<Conformance.Report<never, never>, never> =>
  Conformance.released(oracleLife(peer, notes), { probe: peer.released })

Feature('Releasing what a supervised socket child held', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A child stopped at any point of its life leaves the peer it talked to holding no connection',
      Gherkin.Do.pipe(
        Given('a peer that greets every child that dials it, and a note of how the run ends')(
          'observed',
          () =>
            Effect.all({
              peer: memoryTransport,
              notes: Effect.all({
                failures: Ref.make(Option.none<string>()),
                ending: Ref.make(Option.none<string>()),
              }),
            }),
        ),
        When('the medium runs a child against that peer and stops it at every step of its life')(
          'checked',
          (s) => checkedAgainstTheMemoryPeer(s.observed.peer, s.observed.notes),
        ),
        Then(
          'the child read the greeting, wrote its answer back, was stopped as a shutdown, and left the peer holding nothing',
        )(
          (s, expect) =>
            Effect.map(
              Effect.all({
                frames: s.observed.peer.received,
                failed: failureOf(s.observed.notes),
                ending: endingOf(s.observed.notes),
              }),
              ({ frames, failed, ending }) =>
                expect({
                  report: s.checked,
                  stoppedSteps: stoppedStepsOf(s.checked),
                  failed,
                  ending,
                  frames,
                }).toMatchObject({
                  report: { _tag: 'Pass' },
                  stoppedSteps: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
                  failed: Option.none(),
                  ending: Option.some('Shutdown'),
                  frames: expect.arrayContaining([ECHO]),
                }),
            ),
        ),
      ),
    )

    scenario(
      'The loopback listener a child dialed stops answering once the work that opened it stops',
      Gherkin.Do.pipe(
        Given('a peer that stands in for the listener, and a note of how the run ends')(
          'observed',
          () =>
            Effect.all({
              peer: memoryTransport,
              notes: Effect.all({
                failures: Ref.make(Option.none<string>()),
                ending: Ref.make(Option.none<string>()),
              }),
            }),
        ),
        When('the medium runs a child against a listener opened inside the check, stopped at every step')(
          'checked',
          (s) => checkedAgainstTheLoopbackOracle(s.observed.peer, s.observed.notes),
        ),
        Then(
          'the child read the listener greeting, wrote its answer back, was stopped as a shutdown, and left the listener holding nothing',
        )(
          (s, expect) =>
            Effect.map(
              Effect.all({
                frames: s.observed.peer.received,
                failed: failureOf(s.observed.notes),
                ending: endingOf(s.observed.notes),
              }),
              ({ frames, failed, ending }) =>
                expect({
                  report: s.checked,
                  stoppedSteps: stoppedStepsOf(s.checked),
                  failed,
                  ending,
                  frames,
                }).toMatchObject({
                  report: { _tag: 'Pass' },
                  stoppedSteps: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
                  failed: Option.none(),
                  ending: Option.some('Shutdown'),
                  frames: expect.arrayContaining([ECHO]),
                }),
            ),
        ),
      ),
    )
  })
