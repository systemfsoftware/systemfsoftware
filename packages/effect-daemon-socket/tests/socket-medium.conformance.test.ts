import { Conformance } from '@systemfsoftware/conformance-spec'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Cause, Deferred, Effect, Layer, Match, Option, Ref, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import { type MemoryTransport, memoryTransport } from './__fixtures__/memory-transport.fixture.js'

const Feature = makeFeature({ it })

const GREETING = 'socket-medium-greeting'
const ECHO = 'socket-medium-echo'

const passRuns = (report: Conformance.Report<never, never>): Conformance.Pass =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed),
    Match.orElse(() => {
      throw new Error(
        `expected every stopped life to release what it held, but the check read: ${Conformance.render(report)}`,
      )
    }),
  )

const stoppedAtLeastOneStep = (report: Conformance.Report<never, never>): void => {
  if (passRuns(report).histories < 1) {
    throw new Error('the check stopped no step, so the release proves nothing')
  }
}

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

const ranToShutdown = (notes: Notes): Effect.Effect<void> =>
  Effect.gen(function*() {
    const failed = yield* failureOf(notes)
    const ended = yield* endingOf(notes)
    const seen = Option.getOrElse(ended, () => 'nothing')
    if (Option.isSome(failed)) {
      throw new Error(`the child's life never settled: ${failed.value} (the run noted: ${seen})`)
    }
    if (ended.pipe(Option.exists((ending: string) => ending === 'Shutdown'))) return
    throw new Error(`a stopped child reported ${seen} instead of a shutdown`)
  })

const echoedTo = (peer: MemoryTransport): Effect.Effect<void> =>
  Effect.gen(function*() {
    const frames = yield* peer.received
    if (!frames.includes(ECHO)) {
      throw new Error('the peer never received the frame the child wrote back over the connection')
    }
  })

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
        Then('the child read the greeting, wrote its answer back and was stopped as a shutdown')((s) =>
          Effect.gen(function*() {
            stoppedAtLeastOneStep(s.checked)
            yield* ranToShutdown(s.observed.notes)
            yield* echoedTo(s.observed.peer)
          })
        ),
        And('no stopped life left the peer holding a connection')((s) => {
          passRuns(s.checked)
        }),
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
        Then('the child read the listener greeting, wrote its answer back and was stopped as a shutdown')((s) =>
          Effect.gen(function*() {
            stoppedAtLeastOneStep(s.checked)
            yield* ranToShutdown(s.observed.notes)
            yield* echoedTo(s.observed.peer)
          })
        ),
        And('no interrupted life left the listener holding a connection')((s) => {
          passRuns(s.checked)
        }),
      ),
    )
  })
