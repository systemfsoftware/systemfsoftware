import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Context, Effect, Exit, Layer, Ref, Scope } from 'effect'
import type * as NetAddress from 'effect/net/NetAddress'
import type * as Socket from 'effect/socket/Socket'

export const LOOPBACK = '127.0.0.1'
export const OK_REPLY = 'HTTP/1.0 200 OK'

export class GuestService extends Context.Service<
  GuestService,
  {
    readonly hostPort: number
    readonly replyWith: (statusLine: string) => Effect.Effect<void>
    readonly release: Effect.Effect<void>
  }
>()('@systemfsoftware/effect-readiness/tests/GuestService') {}

const portOf = (address: NetAddress.SocketAddress): number => 'port' in address ? address.port : 0

const answeredWith = (reply: Ref.Ref<string>) => (socket: Socket.Socket): Effect.Effect<void, Socket.SocketError> =>
  Effect.scoped(
    Effect.gen(function*() {
      const reader = yield* socket.reader
      const writer = yield* socket.writer
      yield* writer.write(`${yield* Ref.get(reply)}\r\nConnection: close\r\n\r\n`)
      yield* reader.pull
    }),
  )

export const guestService = (initialReply: string = OK_REPLY): Layer.Layer<GuestService> =>
  Layer.effect(
    GuestService,
    Effect.gen(function*() {
      const scope = yield* Scope.fork(yield* Effect.scope)
      const reply = yield* Ref.make(initialReply)
      const server = yield* NodeSocketServer.make({ host: LOOPBACK, port: 0 }).pipe(Effect.orDie, Scope.provide(scope))
      yield* server.run(answeredWith(reply)).pipe(Effect.forkIn(scope))
      return {
        hostPort: portOf(server.address),
        replyWith: (statusLine: string) => Ref.set(reply, statusLine),
        release: Scope.close(scope, Exit.void),
      }
    }),
  )
