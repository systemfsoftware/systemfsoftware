import { Effect, Schedule, Schema } from 'effect'
import type * as Scope from 'effect/Scope'
import { createServer, type Server, type Socket } from 'node:net'

const LOOPBACK = '127.0.0.1'
const HTTP_OK = 'HTTP/1.0 200 OK'
const POLL_SPACING = '5 millis'
const POLL_ATTEMPTS = 40

/** The loopback service the probe's check judges against: it sees what the host really opened. */
export interface LoopbackService {
  readonly port: number
  readonly accepted: () => number
  readonly open: () => number
  readonly stop: Effect.Effect<void>
  readonly released: Effect.Effect<void, ConnectionLeak>
}

/** The release probe fails with this when a stopped probe still holds a server connection. */
export class ConnectionLeak extends Schema.TaggedError<ConnectionLeak>()('ConnectionLeak', {
  open: Schema.Int,
}) {}

const zeroOpenConnections = (open: () => number): Effect.Effect<void, ConnectionLeak> =>
  Effect.repeat(
    Effect.sync(open),
    {
      schedule: Schedule.spaced(POLL_SPACING),
      until: (count: number) => count === 0,
      times: POLL_ATTEMPTS,
    },
  ).pipe(
    Effect.flatMap((count) =>
      count === 0
        ? Effect.void
        : Effect.fail(new ConnectionLeak({ open: count }))
    ),
  )

const portOf = (server: Server): number => {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

const listened = (server: Server): Effect.Effect<number> =>
  Effect.callback<number>((resume) => {
    server.listen(0, LOOPBACK, () => resume(Effect.succeed(portOf(server))))
  })

const stopped = (server: Server, sockets: Set<Socket>): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    for (const socket of sockets) socket.destroy()
    server.close(() => resume(Effect.void))
  })

/**
 * A loopback service on a free port that counts every accepted connection and
 * answers health requests. The open-connection count is the release oracle: it
 * reaches zero only when the prober really let go of its socket.
 */
const opened = (): { readonly sockets: Set<Socket>; readonly counts: { accepted: number } } => ({
  sockets: new Set<Socket>(),
  counts: { accepted: 0 },
})

export const loopbackService: Effect.Effect<LoopbackService, never, Scope.Scope> = Effect.acquireRelease(
  Effect.gen(function*() {
    const current = opened()
    const sockets = current.sockets
    const counts = current.counts
    const server = createServer((socket) => {
      counts.accepted += 1
      sockets.add(socket)
      socket.on('close', () => {
        sockets.delete(socket)
      })
      socket.on('error', () => undefined)
      socket.on('data', () => {
        socket.write(`${HTTP_OK}\r\nConnection: close\r\n\r\n`)
      })
    })
    const port = yield* listened(server)
    const open = (): number => sockets.size
    return {
      port,
      accepted: () => counts.accepted,
      open,
      stop: stopped(server, sockets),
      released: zeroOpenConnections(open),
    }
  }),
  (service) => service.stop,
)
