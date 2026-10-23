import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type Server, type ServerResponse } from 'node:http'

const LOOPBACK = '127.0.0.1'

export const SECRET_HEADER = 'x-monitor-bypass'

export const FORM_PAGE = `<!doctype html>
<html>
  <head>
    <title>Order form</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/missing.css">
    <script>console.log('form ready')</script>
  </head>
  <body>
    <a href="/next?tab=open&tab=all">Next</a>
    <form aria-label="Order">
      <label>Email <input type="email" name="email"></label>
      <label><input type="checkbox" name="agree"> Agree</label>
      <button type="button">Save</button>
      <button type="button">Delete</button>
      <button type="button">Delete</button>
      <button type="button" disabled>Archive</button>
      <button type="button" data-testid="submit-order">Place order</button>
    </form>
  </body>
</html>`

const NEXT_PAGE = '<!doctype html><html><head><title>Next</title></head><body><h1>Next</h1></body></html>'

export interface SeenRequest {
  readonly path: string
  readonly secretHeader: string
}

export interface WebSite {
  readonly origin: string
  readonly seen: Effect.Effect<ReadonlyArray<SeenRequest>>
}

const ROUTES: Readonly<Record<string, { readonly type: string; readonly body: string }>> = {
  '/form': { type: 'text/html', body: FORM_PAGE },
  '/next': { type: 'text/html', body: NEXT_PAGE },
  '/style.css': { type: 'text/css', body: 'body { font-family: sans-serif; }' },
}

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

const answer = (response: ServerResponse, path: string): void => {
  const route = ROUTES[path]
  if (route === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': route.type })
  response.end(route.body)
}

/** A local static site that records, per request, the value of the secret context header. */
export const webSite: Effect.Effect<WebSite, never, Scope.Scope> = Effect.gen(function*() {
  const seen: Array<SeenRequest> = []
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', `http://${LOOPBACK}`).pathname
    const header = request.headers[SECRET_HEADER]
    seen.push({ path, secretHeader: typeof header === 'string' ? header : '' })
    answer(response, path)
  })
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return { origin: `http://${LOOPBACK}:${port}`, seen: Effect.sync(() => [...seen]) }
})

export const refusedOrigin: Effect.Effect<string> = Effect.gen(function*() {
  const server = createServer()
  const port = yield* listened(server)
  yield* closed(server)
  return `http://${LOOPBACK}:${port}`
})
