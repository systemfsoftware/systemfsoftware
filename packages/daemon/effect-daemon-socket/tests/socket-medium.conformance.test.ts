import { Conformance } from '@systemfsoftware/conformance-spec'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Cause, Duration, Effect, Layer, Match, Option, Ref, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import { type MemoryTransport, memoryTransport } from './__fixtures__/memory-transport.fixture.js'

const Feature = makeFeature({ it })

const GREETING = 'socket-medium-greeting'
const ECHO = 'socket-medium-echo'

const ECHO_WINDOW = '10 millis'

interface Notes {
  readonly failures: Ref.Ref<Option.Option<string>>
  readonly ending: Ref.Ref<Option.Option<string>>
}

interface SocketWorld {
  readonly peer: MemoryTransport
  readonly notes: Notes
}

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

const fakeProber: Layer.Layer<Readiness.HostProber> = Layer.succeed(Readiness.HostProber, {
  dial: () => Effect.succeed({ _tag: 'Connected' as const }),
  exchange: () => Effect.succeed({ _tag: 'Refused' as const }),
})

const mediumEnvironment = Layer.provideMerge(SocketMedium.layer({ readyPollMillis: 5 }), fakeProber)

const socketWorld: Effect.Effect<SocketWorld> = Effect.gen(function*() {
  return {
    peer: yield* memoryTransport,
    notes: {
      failures: yield* Ref.make<Option.Option<string>>(Option.none()),
      ending: yield* Ref.make<Option.Option<string>>(Option.none()),
    },
  }
})

const echoing: (connection: SocketMedium.SocketConnection) => Effect.Effect<void, never, never> = (connection) =>
  Stream.runForEach(connection.frames, () => Effect.orDie(connection.send(ECHO))).pipe(Effect.orDie)

type PortShape = Supervisor.Medium.MediumPortShape<SocketMedium.SocketProgram, never, Scope.Scope>

const recordedFailure = (notes: Notes) => (cause: Cause.Cause<never>) =>
  Cause.hasInterruptsOnly(cause)
    ? Effect.failCause(cause)
    : Ref.set(notes.failures, Option.some(Cause.pretty(cause)))

const lifeAgainst = (
  program: SocketMedium.SocketProgram,
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
      yield* Effect.sleep(ECHO_WINDOW)
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

const againstTheMemoryPeer = (world: SocketWorld): Effect.Effect<void, never, never> =>
  Effect.provideService(
    Effect.provide(
      lifeAgainst(
        { address: { host: '127.0.0.1', port: 65_000 }, ready: Readiness.Wait.forLog(GREETING), run: echoing },
        world.peer.greet(GREETING),
        world.notes,
      ),
      mediumEnvironment,
    ),
    SocketMedium.Dialer,
    world.peer,
  )

const oracleLife = (world: SocketWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const oracle = yield* Effect.provideService(
      Effect.orDie(SocketMedium.makeLoopbackServer),
      SocketMedium.LoopbackListener,
      world.peer,
    )
    yield* oracle.advance({ _tag: 'BecomeReady' }, 0)
    yield* oracle.advance({ _tag: 'BecomeReady' }, 0)
    yield* Effect.provideService(
      Effect.provide(
        lifeAgainst(
          { address: oracle.address, ready: Readiness.Wait.forLog(SocketMedium.READY_FRAME), run: echoing },
          Effect.void,
          world.notes,
        ),
        mediumEnvironment,
      ),
      SocketMedium.Dialer,
      world.peer,
    )
  })

const ruleMessage = (
  ending: Option.Option<string>,
  failures: Option.Option<string>,
  received: ReadonlyArray<string>,
  released: boolean,
): string | undefined =>
  Option.getOrElse(ending, () => 'nothing') !== 'Shutdown'
    ? `the child was reported ${Option.getOrElse(ending, () => 'nothing')}, not a shutdown`
    : Option.match(failures, {
      onSome: (failure) => `the child's reader was left failed: ${failure}`,
      onNone: () =>
        released
          ? (received.includes(ECHO) ? undefined : 'the child never wrote its answer back to the peer')
          : 'the peer still holds a connection the child dialled',
    })

const releasedWithin = (world: SocketWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    const ending = yield* Ref.get(world.notes.ending)
    const failures = yield* Ref.get(world.notes.failures)
    const received = yield* world.peer.received
    const released = (yield* world.peer.held) === 0
    const message = ruleMessage(ending, failures, received, released)
    return yield* message === undefined ? Effect.void : new Conformance.RuleBroken({ message })
  })

const socketSpec = (
  program: (world: SocketWorld) => Effect.Effect<void, never, Scope.Scope>,
): Effect.Effect<Conformance.Report<never, never>> =>
  Conformance.stopped({
    unit: SocketMedium.port,
    world: socketWorld,
    program: (world) => program(world),
    restart: (world) => Effect.andThen(world.peer.restarted, program(world)),
    rule: (world) => releasedWithin(world),
    stopWithin: Duration.zero,
  })

Feature('Releasing what a supervised socket child held', { timeout: 0 })
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A child stopped at any point of its life leaves the peer it talked to holding no connection',
      Gherkin.Do.pipe(
        Given('a peer that greets every child that dials it, and a note of how the run ends')(
          'program',
          () => Effect.succeed(againstTheMemoryPeer),
        ),
        When('the medium runs a child against that peer and stops it at every step of its life')(
          'checked',
          (s) => socketSpec(s.program),
        ),
        Then(
          'the child read the greeting, wrote its answer back, was stopped as a shutdown, and left the peer holding nothing',
        )((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'The loopback listener a child dialed stops answering once the work that opened it stops',
      Gherkin.Do.pipe(
        Given('a peer that stands in for the listener, and a note of how the run ends')(
          'program',
          () => Effect.succeed(oracleLife),
        ),
        When('the medium runs a child against a listener opened inside the check, stopped at every step')(
          'checked',
          (s) => socketSpec(s.program),
        ),
        Then(
          'the child read the listener greeting, wrote its answer back, was stopped as a shutdown, and left the listener holding nothing',
        )((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )
  })
