import { Effect } from 'effect'
import { createServer, type Server } from 'node:net'

const LOOPBACK = '127.0.0.1'

const portOf = (server: Server): number => {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

const listened = (server: Server): Effect.Effect<number> =>
  Effect.callback<number>((resume) => {
    server.listen(0, LOOPBACK, () => resume(Effect.succeed(portOf(server))))
  })

const stopped = (server: Server): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void))
  })

export const reserveFreePort: Effect.Effect<number> = Effect.scoped(
  Effect.acquireRelease(
    Effect.gen(function*() {
      const server = createServer()
      const port = yield* listened(server)
      return { server, port }
    }),
    ({ server }) => stopped(server),
  ).pipe(Effect.map(({ port }) => port)),
)
