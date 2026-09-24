import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { Context, Effect, Layer, Option } from 'effect'
import type * as Scope from 'effect/Scope'
import type { Socket } from 'effect/unstable/socket'
import type { SocketAddress } from './socket-program.js'

/**
 * How the medium opens the connection a child runs on. A composition root that
 * names no dialer dials over a real TCP socket; a check that must not open one
 * provides its own dialer as a layer and the medium dials through that.
 */
export interface DialerShape {
  readonly open: (address: SocketAddress) => Effect.Effect<Socket.Socket, never, Scope.Scope>
}

export const nodeDialer: DialerShape = {
  open: (address) => NodeSocket.makeNet({ host: address.host, port: address.port }),
}

export const Dialer = Context.Service<DialerShape>('@systemfsoftware/effect-daemon-socket/SocketMedium/Dialer')

/** The dialer the medium dials with: what the context provides, or the Node adapter. */
export const dialerOf: Effect.Effect<DialerShape> = Effect.map(
  Effect.serviceOption(Dialer),
  Option.getOrElse(() => nodeDialer),
)

/** The Node adapter as a layer, for a root that provides or names it explicitly. */
export const dialerLayer: Layer.Layer<DialerShape> = Layer.succeed(Dialer, nodeDialer)
