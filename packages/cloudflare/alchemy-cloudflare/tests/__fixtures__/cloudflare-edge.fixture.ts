import { Effect } from 'effect'
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from 'node:http'

export interface ScriptedResponse {
  readonly status: number
  readonly body: string
  readonly headers: Readonly<Record<string, string>>
}

export interface SeenRequest {
  readonly method: string
  readonly url: string
  readonly authorization: string | undefined
}

export interface CloudflareEdge {
  readonly baseUrl: string
  readonly seen: ReadonlyArray<SeenRequest>
  readonly script: (respond: (count: number, body: string) => ScriptedResponse) => void
  readonly close: Effect.Effect<void>
}

const headerValue = (headers: IncomingHttpHeaders, name: string): string | undefined => {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

const listenPort = (server: Server): Effect.Effect<number> =>
  Effect.callback<number>((resume) => {
    server.once('error', (error) => resume(Effect.die(error)))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        resume(Effect.die(new Error('the edge has no loopback port')))
        return
      }
      resume(Effect.succeed(address.port))
    })
  })

const closeServer = (server: Server): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void))
  })

/**
 * A loopback HTTP server that answers every request with the currently scripted
 * envelope, recording what each request carried. The test points the generated
 * client's credentials at `baseUrl` and scripts one response per scenario.
 */
export const cloudflareEdge: Effect.Effect<CloudflareEdge> = Effect.gen(function*() {
  const state = {
    respond: (_count: number, _body: string): ScriptedResponse => ({ status: 200, body: '{}', headers: {} }),
    seen: [] as Array<SeenRequest>,
  }

  const onRequest: RequestListener = (request, response) => {
    const chunks: Array<Buffer> = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      state.seen.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: headerValue(request.headers, 'authorization'),
      })
      const scripted = state.respond(state.seen.length, Buffer.concat(chunks).toString('utf8'))
      response.writeHead(scripted.status, { 'content-type': 'application/json', ...scripted.headers })
      response.end(scripted.body)
    })
  }

  const server = createServer(onRequest)
  const port = yield* listenPort(server)

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    seen: state.seen,
    script: (respond) => {
      state.respond = respond
      state.seen.length = 0
    },
    close: closeServer(server),
  }
})

/**
 * A base URL for a loopback port nothing is listening on: bind an ephemeral
 * port, learn it, release it. A real connection to it is refused.
 */
export const closedBaseUrl: Effect.Effect<string> = Effect.gen(function*() {
  const probe = createServer()
  const port = yield* listenPort(probe)
  yield* closeServer(probe)
  return `http://127.0.0.1:${port}`
})
