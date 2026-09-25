import * as NodeSocket from '@effect/platform-node/NodeSocket'
import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Context, Effect, Layer, Option } from 'effect'
import type * as Scope from 'effect/Scope'
import * as NetAddress from 'effect/unstable/net/NetAddress'
import type { Socket } from 'effect/unstable/socket'
import type * as SocketServer from 'effect/unstable/socket/SocketServer'
import { textOf } from './socket-text.js'

const LOOPBACK_HOST = '127.0.0.1'

type RawSocket = NodeSocket.NetSocket['Service']

/**
 * The peer side of one connection a listener accepted: what the oracle's
 * scripted steps send back, end, reset or hold, and how the connection's frames
 * and its close are observed. The Node adapter backs it with a `net.Socket`; a
 * check that must not open a real one backs it with an in-memory pair.
 */
export interface AcceptedConnection {
  readonly send: (frame: string) => Effect.Effect<void>
  readonly end: Effect.Effect<void>
  readonly reset: Effect.Effect<void>
  readonly hold: Effect.Effect<void>
  readonly onFrame: (record: (frame: string) => void) => Effect.Effect<void>
  readonly onClose: (record: () => void) => Effect.Effect<void>
}

export interface SocketAddress {
  readonly host: string
  readonly port: number
}

export interface BoundListener {
  readonly address: SocketAddress
  readonly serve: Effect.Effect<void, SocketServer.SocketServerError, Scope.Scope>
}

export interface LoopbackListenerShape {
  readonly listen: (
    accept: (connection: AcceptedConnection) => Effect.Effect<void>,
  ) => Effect.Effect<BoundListener, SocketServer.SocketServerError, Scope.Scope>
}

const portOf = (address: NetAddress.SocketAddress): number =>
  Option.getOrElse(
    Option.map(Option.liftPredicate(address, NetAddress.isInetAddress), (inet) => inet.port),
    () => 0,
  )

const connectionOver = (net: RawSocket): AcceptedConnection => ({
  send: (frame) => Effect.sync(() => net.write(frame)),
  end: Effect.sync(() => net.end()),
  reset: Effect.sync(() => net.resetAndDestroy()),
  hold: Effect.sync(() => {
    net.allowHalfOpen = true
  }),
  onFrame: (record) =>
    Effect.sync(() => {
      net.on('data', (chunk) => record(textOf(chunk)))
    }),
  onClose: (record) =>
    Effect.sync(() => {
      net.on('close', () => record())
    }),
})

export const nodeLoopbackListener: LoopbackListenerShape = {
  listen: (accept) =>
    Effect.gen(function*() {
      const server = yield* NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0, allowHalfOpen: true })
      const address = { host: LOOPBACK_HOST, port: portOf(server.address) }
      const serve = server.run((_socket: Socket.Socket) =>
        Effect.gen(function*() {
          const net = Option.getOrThrow(yield* Effect.serviceOption(NodeSocket.NetSocket))
          net.allowHalfOpen = false
          net.resume()
          yield* accept(connectionOver(net))
          return yield* Effect.never
        })
      )
      return { address, serve }
    }),
}

export const LoopbackListener = Context.Service<LoopbackListenerShape>(
  '@systemfsoftware/effect-daemon-socket/SocketMedium/LoopbackListener',
)

export const listenerOf: Effect.Effect<LoopbackListenerShape> = Effect.map(
  Effect.serviceOption(LoopbackListener),
  Option.getOrElse(() => nodeLoopbackListener),
)

export const listenerLayer: Layer.Layer<LoopbackListenerShape> = Layer.succeed(LoopbackListener, nodeLoopbackListener)
