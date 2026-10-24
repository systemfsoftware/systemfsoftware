import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type Server } from 'node:http'

const LOOPBACK = '127.0.0.1'

const PAGE = `<!doctype html>
<html>
  <head><title>Home</title></head>
  <body><main><h1>Welcome home</h1></main></body>
</html>`

const portOf = (server: Server): number => {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

const listened = (server: Server): Effect.Effect<number> =>
  Effect.callback<number>((resume) => {
    server.listen(0, LOOPBACK, () => resume(Effect.succeed(portOf(server))))
  })

const closed = (server: Server): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    server.closeAllConnections()
    server.close(() => resume(Effect.void))
  })

export const servedHeadingSite: Effect.Effect<string, never, Scope.Scope> = Effect.gen(function*() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(PAGE)
  })
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return `http://${LOOPBACK}:${port}`
})
