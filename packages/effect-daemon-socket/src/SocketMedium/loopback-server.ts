import * as NodeSocket from '@effect/platform-node/NodeSocket'
import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Readiness as ReadinessModule } from '@systemfsoftware/effect-readiness'
import { Effect, Match, Option, Predicate, Queue } from 'effect'
import * as NetAddress from 'effect/unstable/net/NetAddress'
import type * as Socket from 'effect/unstable/socket/Socket'
import type { SocketAddress } from './socket-program.js'

export const READY_FRAME = 'socket-medium-ready'

const LOOPBACK_HOST = '127.0.0.1'
const decoder = new TextDecoder()

export interface LoopbackServer {
  readonly address: SocketAddress
  readonly ready: Readiness.Condition
  readonly advance: (step: Conformance.ChildStep) => Effect.Effect<void>
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

const claimOf = (state: FixtureState): Effect.Effect<ServerConnection> =>
  Effect.flatMap(Effect.sync(() => state.current), (known) =>
    Option.match(known, {
      onSome: (connection) => Effect.succeed(connection),
      onNone: () => Queue.take(state.arrived),
    }))

const trackOf = (state: FixtureState, net: RawSocket): void => {
  state.current = Option.some(connectionOf(net))
  state.open += 1
  net.allowHalfOpen = false
  net.on('data', (chunk) => {
    state.received.push(textOf(chunk))
  })
  net.on('close', () => {
    state.open -= 1
  })
  net.resume()
  Queue.offerUnsafe(state.arrived, Option.getOrThrow(state.current))
}

const acceptOf = (state: FixtureState) => (_socket: Socket.Socket): Effect.Effect<never, never, never> =>
  Effect.gen(function*() {
    const net = Option.getOrThrow(yield* Effect.serviceOption(NodeSocket.NetSocket))
    yield* Effect.sync(() => {
      trackOf(state, net)
    })
    return yield* Effect.never
  })

export const makeLoopbackServer = Effect.gen(function*() {
  const server = yield* NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0, allowHalfOpen: true })
  const state: FixtureState = {
    arrived: yield* Queue.unbounded<ServerConnection>(),
    current: Option.none(),
    open: 0,
    received: [],
  }
  yield* Effect.forkScoped(server.run(acceptOf(state)))
  return {
    address: { host: LOOPBACK_HOST, port: portOf(server.address) },
    ready: ReadinessModule.Wait.forLog(READY_FRAME),
    advance: (step: Conformance.ChildStep) => Effect.flatMap(claimOf(state), (connection) => enactOf(connection)(step)),
    receivedFrames: Effect.sync(() => [...state.received]),
    openConnections: Effect.sync(() => state.open),
  }
})
