import * as NodeSocket from '@effect/platform-node/NodeSocket'
import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Readiness as ReadinessModule } from '@systemfsoftware/effect-readiness'
import { Array as Arr, Effect, HashMap, Match, MutableRef, Option, Ref } from 'effect'
import * as NetAddress from 'effect/unstable/net/NetAddress'
import type * as Socket from 'effect/unstable/socket/Socket'
import type { SocketAddress } from './socket-program.js'
import { textOf } from './socket-text.js'

export const READY_FRAME = 'socket-medium-ready'

const LOOPBACK_HOST = '127.0.0.1'

export interface LoopbackServer {
  readonly address: SocketAddress
  readonly ready: Readiness.Condition
  readonly advance: (step: Conformance.ChildStep, generation: number) => Effect.Effect<void>
  readonly receivedFrames: Effect.Effect<ReadonlyArray<string>>
  readonly openConnections: Effect.Effect<number>
}

interface ServerConnection {
  readonly greet: Effect.Effect<void>
  readonly end: Effect.Effect<void>
  readonly reset: Effect.Effect<void>
  readonly hold: Effect.Effect<void>
}

interface Routing {
  readonly accepted: number
  readonly byGeneration: HashMap.HashMap<number, ServerConnection>
  readonly waiting: HashMap.HashMap<number, ReadonlyArray<Conformance.ChildStep>>
}

interface FixtureState {
  readonly routing: Ref.Ref<Routing>
  readonly open: MutableRef.MutableRef<number>
  readonly received: MutableRef.MutableRef<ReadonlyArray<string>>
}

type RawSocket = NodeSocket.NetSocket['Service']

const portOf = (address: NetAddress.SocketAddress): number =>
  Option.getOrElse(
    Option.map(Option.liftPredicate(address, NetAddress.isInetAddress), (inet) => inet.port),
    () => 0,
  )

const connectionOf = (net: RawSocket): ServerConnection => ({
  greet: Effect.sync(() => {
    net.write(READY_FRAME)
  }),
  end: Effect.sync(() => {
    net.end()
  }),
  reset: Effect.sync(() => {
    net.resetAndDestroy()
  }),
  hold: Effect.sync(() => {
    net.allowHalfOpen = true
  }),
})

const enactOf = (connection: ServerConnection) => (step: Conformance.ChildStep): Effect.Effect<void> =>
  Match.value(step).pipe(
    Match.tag('BecomeReady', () => connection.greet),
    Match.tag('ExitNormal', () => connection.end),
    Match.tag('ExitAbnormal', () => connection.reset),
    Match.tag('IgnoreGracefulStop', () => connection.hold),
    Match.tag('NeverBecomeReady', () => Effect.void),
    Match.exhaustive,
  )

const heldFor = (routing: Routing, generation: number): ReadonlyArray<Conformance.ChildStep> =>
  Option.getOrElse(HashMap.get(routing.waiting, generation), () => [])

const claimedBy = (connection: ServerConnection) => (routing: Routing) =>
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
        Option.none<ServerConnection>(),
        {
          ...routing,
          waiting: HashMap.set(routing.waiting, generation, Arr.append(heldFor(routing, generation), step)),
        },
      ] as const,
  })

/**
 * Each incarnation dials this server once, so the order connections arrive in is the kernel's
 * generation for that child. Claiming a generation and taking the steps held for it is one
 * atomic update, as is holding a step for a generation not yet connected, so no step can fall
 * between the two; a step for a connected generation reaches exactly that peer, never the
 * superseded incarnation whose connection is still open.
 */
const trackOf = (state: FixtureState, net: RawSocket): Effect.Effect<void> =>
  Effect.gen(function*() {
    const connection = connectionOf(net)
    MutableRef.increment(state.open)
    net.allowHalfOpen = false
    net.on('data', (chunk) => {
      MutableRef.update(state.received, (frames) => Arr.append(frames, textOf(chunk)))
    })
    net.on('close', () => {
      MutableRef.decrement(state.open)
    })
    net.resume()
    const claim = yield* Ref.modify(state.routing, claimedBy(connection))
    yield* Effect.forEach(claim.held, enactOf(connection), { discard: true })
  })

const acceptOf = (state: FixtureState) => (_socket: Socket.Socket): Effect.Effect<never, never, never> =>
  Effect.gen(function*() {
    const net = Option.getOrThrow(yield* Effect.serviceOption(NodeSocket.NetSocket))
    yield* trackOf(state, net)
    return yield* Effect.never
  })

const sendTo = (state: FixtureState) => (step: Conformance.ChildStep, generation: number): Effect.Effect<void> =>
  Effect.flatMap(
    Ref.modify(state.routing, routedTo(step, generation)),
    Option.match({ onSome: (connection) => enactOf(connection)(step), onNone: () => Effect.void }),
  )

export const makeLoopbackServer = Effect.gen(function*() {
  const server = yield* NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0, allowHalfOpen: true })
  const state: FixtureState = {
    routing: yield* Ref.make<Routing>({ accepted: 0, byGeneration: HashMap.empty(), waiting: HashMap.empty() }),
    open: MutableRef.make(0),
    received: MutableRef.make<ReadonlyArray<string>>([]),
  }
  yield* Effect.forkScoped(server.run(acceptOf(state)))
  return {
    address: { host: LOOPBACK_HOST, port: portOf(server.address) },
    ready: ReadinessModule.Wait.forLog(READY_FRAME),
    advance: sendTo(state),
    receivedFrames: Effect.sync(() => MutableRef.get(state.received)),
    openConnections: Effect.sync(() => MutableRef.get(state.open)),
  }
})
