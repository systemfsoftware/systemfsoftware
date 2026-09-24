import * as NodeSocket from '@effect/platform-node/NodeSocket'
import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Readiness as ReadinessModule } from '@systemfsoftware/effect-readiness'
import { Effect, HashMap, Match, Option, Predicate, Queue } from 'effect'
import * as NetAddress from 'effect/unstable/net/NetAddress'
import type * as Socket from 'effect/unstable/socket/Socket'
import type { SocketAddress } from './socket-program.js'

export const READY_FRAME = 'socket-medium-ready'

const LOOPBACK_HOST = '127.0.0.1'
const decoder = new TextDecoder()

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

interface FixtureState {
  readonly arrived: Queue.Queue<ServerConnection>
  current: Option.Option<ServerConnection>
  accepted: number
  byGeneration: HashMap.HashMap<number, ServerConnection>
  waiting: HashMap.HashMap<number, ReadonlyArray<Conformance.ChildStep>>
  open: number
  readonly received: Array<string>
}

type RawSocket = NodeSocket.NetSocket['Service']

const textOf = (chunk: string | Uint8Array): string =>
  Match.value(chunk).pipe(
    Match.when(Predicate.isString, (text) => text),
    Match.orElse((bytes) => decoder.decode(bytes)),
  )

const portOf = (address: NetAddress.SocketAddress): number =>
  Option.getOrElse(
    Option.map(Option.filter(Option.some(address), NetAddress.isInetAddress), (inet) => inet.port),
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

const heldFor = (
  state: FixtureState,
  generation: number,
): ReadonlyArray<Conformance.ChildStep> => Option.getOrElse(HashMap.get(state.waiting, generation), () => [])

/**
 * Each incarnation dials this server once, so the order connections arrive in is the kernel's
 * generation for that child. A step addressed to a generation that has not dialled yet is held
 * until it does; a step for the generation that is connected reaches exactly that peer, never
 * the superseded incarnation whose connection is still open.
 */
const trackOf = (state: FixtureState, net: RawSocket): Effect.Effect<void> =>
  Effect.gen(function*() {
    const connection = connectionOf(net)
    const generation = state.accepted
    state.accepted += 1
    state.current = Option.some(connection)
    state.byGeneration = HashMap.set(state.byGeneration, generation, connection)
    state.open += 1
    net.allowHalfOpen = false
    net.on('data', (chunk) => {
      state.received.push(textOf(chunk))
    })
    net.on('close', () => {
      state.open -= 1
    })
    net.resume()
    Queue.offerUnsafe(state.arrived, connection)
    yield* Effect.forEach(heldFor(state, generation), enactOf(connection), { discard: true })
    state.waiting = HashMap.remove(state.waiting, generation)
  })

const acceptOf = (state: FixtureState) => (_socket: Socket.Socket): Effect.Effect<never, never, never> =>
  Effect.gen(function*() {
    const net = Option.getOrThrow(yield* Effect.serviceOption(NodeSocket.NetSocket))
    yield* trackOf(state, net)
    return yield* Effect.never
  })

const sendTo = (state: FixtureState) => (step: Conformance.ChildStep, generation: number): Effect.Effect<void> =>
  Option.match(HashMap.get(state.byGeneration, generation), {
    onSome: (connection) => enactOf(connection)(step),
    onNone: () =>
      Effect.sync(() => {
        state.waiting = HashMap.set(state.waiting, generation, [...heldFor(state, generation), step])
      }),
  })

export const makeLoopbackServer = Effect.gen(function*() {
  const server = yield* NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0, allowHalfOpen: true })
  const state: FixtureState = {
    arrived: yield* Queue.unbounded<ServerConnection>(),
    current: Option.none(),
    accepted: 0,
    byGeneration: HashMap.empty<number, ServerConnection>(),
    waiting: HashMap.empty<number, ReadonlyArray<Conformance.ChildStep>>(),
    open: 0,
    received: [],
  }
  yield* Effect.forkScoped(server.run(acceptOf(state)))
  return {
    address: { host: LOOPBACK_HOST, port: portOf(server.address) },
    ready: ReadinessModule.Wait.forLog(READY_FRAME),
    advance: sendTo(state),
    receivedFrames: Effect.sync(() => [...state.received]),
    openConnections: Effect.sync(() => state.open),
  }
})
