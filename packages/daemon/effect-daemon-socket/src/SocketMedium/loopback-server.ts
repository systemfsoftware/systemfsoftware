import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Readiness as ReadinessModule } from '@systemfsoftware/effect-readiness'
import { Array as Arr, Effect, HashMap, Match, MutableRef, Option, Ref } from 'effect'
import { type AcceptedConnection, listenerOf } from './socket-listener.js'
import type { SocketAddress } from './socket-program.js'

export const READY_FRAME = 'socket-medium-ready'

export interface LoopbackServer {
  readonly address: SocketAddress
  readonly ready: Readiness.Condition
  readonly advance: (step: Conformance.ChildStep, generation: number) => Effect.Effect<void>
  readonly receivedFrames: Effect.Effect<ReadonlyArray<string>>
  readonly openConnections: Effect.Effect<number>
}

interface Routing {
  readonly accepted: number
  readonly byGeneration: HashMap.HashMap<number, AcceptedConnection>
  readonly waiting: HashMap.HashMap<number, ReadonlyArray<Conformance.ChildStep>>
}

interface FixtureState {
  readonly routing: Ref.Ref<Routing>
  readonly open: MutableRef.MutableRef<number>
  readonly received: MutableRef.MutableRef<ReadonlyArray<string>>
}

const enactOf = (connection: AcceptedConnection) => (step: Conformance.ChildStep): Effect.Effect<void> =>
  Match.value(step).pipe(
    Match.tag('BecomeReady', () => connection.send(READY_FRAME)),
    Match.tag('ExitNormal', () => connection.end),
    Match.tag('ExitAbnormal', () => connection.reset),
    Match.tag('IgnoreGracefulStop', () => connection.hold),
    Match.tag('NeverBecomeReady', () => Effect.void),
    Match.exhaustive,
  )

const heldFor = (routing: Routing, generation: number): ReadonlyArray<Conformance.ChildStep> =>
  Option.getOrElse(HashMap.get(routing.waiting, generation), () => [])

const claimedBy = (connection: AcceptedConnection) => (routing: Routing) =>
  [
    { generation: routing.accepted, held: heldFor(routing, routing.accepted) },
    {
      accepted: routing.accepted + 1,
      byGeneration: HashMap.set(routing.byGeneration, routing.accepted, connection),
      waiting: HashMap.remove(routing.waiting, routing.accepted),
    },
  ] as const

const routedTo = (step: Conformance.ChildStep, generation: number) => (routing: Routing) =>
  Option.match(HashMap.get(routing.byGeneration, generation), {
    onSome: (connection) => [Option.some(connection), routing] as const,
    onNone: () =>
      [
        Option.none<AcceptedConnection>(),
        {
          ...routing,
          waiting: HashMap.set(routing.waiting, generation, Arr.append(heldFor(routing, generation), step)),
        },
      ] as const,
  })

const trackOf = (state: FixtureState, connection: AcceptedConnection): Effect.Effect<void> =>
  Effect.gen(function*() {
    MutableRef.increment(state.open)
    yield* connection.onFrame((frame) => {
      MutableRef.update(state.received, (frames) => Arr.append(frames, frame))
    })
    yield* connection.onClose(() => {
      MutableRef.decrement(state.open)
    })
    const claim = yield* Ref.modify(state.routing, claimedBy(connection))
    yield* Effect.forEach(claim.held, enactOf(connection), { discard: true })
  })

const acceptOf = (state: FixtureState) => (connection: AcceptedConnection): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* trackOf(state, connection)
    return yield* Effect.never
  })

const sendTo = (state: FixtureState) => (step: Conformance.ChildStep, generation: number): Effect.Effect<void> =>
  Effect.flatMap(
    Ref.modify(state.routing, routedTo(step, generation)),
    Option.match({ onSome: (connection) => enactOf(connection)(step), onNone: () => Effect.void }),
  )

export const makeLoopbackServer = Effect.gen(function*() {
  const state: FixtureState = {
    routing: yield* Ref.make<Routing>({ accepted: 0, byGeneration: HashMap.empty(), waiting: HashMap.empty() }),
    open: MutableRef.make(0),
    received: MutableRef.make<ReadonlyArray<string>>([]),
  }
  const bound = yield* Effect.flatMap(listenerOf, (listener) => listener.listen(acceptOf(state)))
  yield* Effect.forkScoped(bound.serve)
  return {
    address: bound.address,
    ready: ReadinessModule.Wait.forLog(READY_FRAME),
    advance: sendTo(state),
    receivedFrames: Effect.sync(() => MutableRef.get(state.received)),
    openConnections: Effect.sync(() => MutableRef.get(state.open)),
  }
})
