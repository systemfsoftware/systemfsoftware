import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type Server, type ServerResponse } from 'node:http'

const LOOPBACK = '127.0.0.1'

const pageWith = (second: string): string =>
  `<!doctype html>
<html>
  <head><title>Greeting app</title></head>
  <body>
    <main>
      <h1>Greeting app</h1>
      <button type="button" id="greet">Greet</button>
      <h2 id="hello" hidden>Hello, Ada</h2>
      <button type="button" id="next" hidden>${second}</button>
      <h2 id="done" hidden>All done</h2>
    </main>
    <script>
      document.getElementById('greet').addEventListener('click', () => {
        document.getElementById('hello').hidden = false
        document.getElementById('next').hidden = false
      })
      document.getElementById('next').addEventListener('click', () => {
        document.getElementById('done').hidden = false
      })
    </script>
  </body>
</html>`

export interface GreetApp {
  readonly origin: string
  readonly renameSecond: (name: string) => Effect.Effect<void>
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

const answer = (response: ServerResponse, path: string, second: string): void => {
  const found = path === '/'
  response.writeHead(found ? 200 : 404, { 'content-type': found ? 'text/html' : 'text/plain' })
  response.end(found ? pageWith(second) : 'not found')
}

export const servedGreetApp: Effect.Effect<GreetApp, never, Scope.Scope> = Effect.gen(function*() {
  const names = { second: 'Continue' }
  const server = createServer((request, response) =>
    answer(response, new URL(request.url ?? '/', `http://${LOOPBACK}`).pathname, names.second)
  )
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return {
    origin: `http://${LOOPBACK}:${port}`,
    renameSecond: (name) => Effect.sync(() => void (names.second = name)),
  }
})
