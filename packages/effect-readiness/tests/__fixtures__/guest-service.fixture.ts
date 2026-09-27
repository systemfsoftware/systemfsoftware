import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Context, Effect, Exit, Layer, Match, Ref, Scope } from 'effect'
import type * as NetAddress from 'effect/unstable/net/NetAddress'
import type * as Socket from 'effect/unstable/socket/Socket'

export const LOOPBACK = '127.0.0.1'
export const OK_REPLY = 'HTTP/1.0 200 OK'

/** What the guest answers on a connection: a status line, or silence that holds the connection open. */
type ReplyMode = { readonly _tag: 'Reply'; readonly statusLine: string } | { readonly _tag: 'Silent' }

export interface GuestHandle {
  readonly hostPort: number
  readonly replyWith: (statusLine: string) => Effect.Effect<void>
  /** Answers no later connection, holding each one open until the caller closes it. */
  readonly silence: Effect.Effect<void>
  /** Connections the guest is holding open right now. */
  readonly openConnections: Effect.Effect<number>
  readonly release: Effect.Effect<void>
}

export class GuestService extends Context.Service<GuestService, GuestHandle>()(
  '@systemfsoftware/effect-readiness/tests/GuestService',
) {}

const portOf = (address: NetAddress.SocketAddress): number => 'port' in address ? address.port : 0

const statusLineOf = (mode: ReplyMode): string | undefined =>
  Match.value(mode).pipe(
    Match.tag('Reply', (reply) => reply.statusLine),
    Match.tag('Silent', () => undefined),
    Match.exhaustive,
  )

/**
 * The reader is acquired before the mode is read, so a silent guest still holds the
 * connection open: the pull that follows settles only when the caller closes its end.
 */
const answeredWith =
  (mode: Ref.Ref<ReplyMode>, held: Ref.Ref<number>) =>
  (socket: Socket.Socket): Effect.Effect<void, Socket.SocketError> =>
    Effect.scoped(
      Effect.gen(function*() {
        yield* Ref.update(held, (open) => open + 1)
        yield* Effect.addFinalizer(() => Ref.update(held, (open) => open - 1))
        const reader = yield* socket.reader
        const writer = yield* socket.writer
        const statusLine = statusLineOf(yield* Ref.get(mode))
        if (statusLine === undefined) return yield* Effect.ignore(Effect.forever(reader.pull))
        yield* writer.write(`${statusLine}\r\nConnection: close\r\n\r\n`)
        yield* reader.pull
      }),
    )

export const makeGuestService = (initialReply: string = OK_REPLY): Effect.Effect<GuestHandle, never, Scope.Scope> =>
  Effect.gen(function*() {
    const scope = yield* Effect.scope
    const mode = yield* Ref.make<ReplyMode>({ _tag: 'Reply', statusLine: initialReply })
    const held = yield* Ref.make(0)
    const server = yield* NodeSocketServer.make({ host: LOOPBACK, port: 0 }).pipe(Effect.orDie)
    yield* Effect.forkScoped(server.run(answeredWith(mode, held)))
    return {
      hostPort: portOf(server.address),
      replyWith: (statusLine: string) => Ref.set(mode, { _tag: 'Reply', statusLine }),
      silence: Ref.set(mode, { _tag: 'Silent' }),
      openConnections: Ref.get(held),
      release: Scope.close(scope, Exit.void),
    }
  })

export const guestService = (initialReply: string = OK_REPLY): Layer.Layer<GuestService> =>
  Layer.effect(GuestService, makeGuestService(initialReply))
