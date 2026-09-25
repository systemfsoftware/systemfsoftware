import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Array as Arr } from 'effect'
import type { Effect, Stream } from 'effect'
import type { Socket } from 'effect/unstable/socket'

export type SocketFrames = Arr.NonEmptyReadonlyArray<Uint8Array | string>

export interface SocketAddress {
  readonly host: string
  readonly port: number
}

export interface SocketConnection {
  readonly frames: Stream.Stream<SocketFrames, Socket.SocketError>
  readonly send: (frame: Uint8Array | string) => Effect.Effect<void, Socket.SocketError>
}

/**
 * What the socket medium interprets (R21, KTD17). `ready` is stated rather than
 * assumed because a connection carries no readiness of its own: a program names
 * how its service announces itself, and the medium evaluates that condition with
 * `@systemfsoftware/effect-readiness` while the connection is already up —
 * `Wait.forLog` reads the frames the peer sends over this connection, `Wait.forTcp`
 * and `Wait.forHttp` probe the address.
 *
 * `run` is what the connection is for, forked into the child's own scope so it
 * dies with the incarnation. A program that names no `run` still holds the
 * connection open for the child's life: a supervised dependency rather than a
 * supervised conversation.
 */
export interface SocketProgram {
  readonly address: SocketAddress
  readonly ready: Readiness.Condition
  readonly run?: (connection: SocketConnection) => Effect.Effect<void, never, never>
}
