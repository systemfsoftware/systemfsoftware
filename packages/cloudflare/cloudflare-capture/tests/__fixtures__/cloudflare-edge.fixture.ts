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
  readonly body: string
}

export interface CloudflareEdge {
  readonly baseUrl: string
  readonly seen: ReadonlyArray<SeenRequest>
  /** Point every subsequent request at a new responder; the request log is cleared. */
  readonly script: (respond: (request: SeenRequest, count: number) => ScriptedResponse) => void
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
 * envelope, recording what each request carried — method, url, authorization,
 * and body. A test points the capture client at `baseUrl` and scripts the
 * answers a scenario needs, routing on the request when a case needs more than
 * one.
 */
export const cloudflareEdge: Effect.Effect<CloudflareEdge> = Effect.gen(function*() {
  const state = {
    respond: (_request: SeenRequest, _count: number): ScriptedResponse => ({ status: 200, body: '{}', headers: {} }),
    seen: [] as Array<SeenRequest>,
  }

  const onRequest: RequestListener = (request, response) => {
    const chunks: Array<Buffer> = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const seen: SeenRequest = {
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: headerValue(request.headers, 'authorization'),
        body: Buffer.concat(chunks).toString('utf8'),
      }
      state.seen.push(seen)
      const scripted = state.respond(seen, state.seen.length)
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
