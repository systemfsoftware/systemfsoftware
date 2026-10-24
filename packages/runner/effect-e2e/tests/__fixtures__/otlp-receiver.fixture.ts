import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const LOOPBACK = '127.0.0.1'

export interface ReceivedExport {
  readonly path: string
  readonly authorization: string
  readonly body: string
}

export interface OtlpReceiver {
  readonly origin: string
  readonly exports: Effect.Effect<ReadonlyArray<ReceivedExport>>
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

const onBody = (request: IncomingMessage, received: (body: string) => void): void => {
  const chunks: Array<Buffer> = []
  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => received(Buffer.concat(chunks).toString('utf8')))
}

export const otlpReceiver: Effect.Effect<OtlpReceiver, never, Scope.Scope> = Effect.gen(function*() {
  const received: Array<ReceivedExport> = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    onBody(request, (body) => {
      received.push({
        path: request.url ?? '',
        authorization: request.headers.authorization ?? '',
        body,
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{}')
    })
  })
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return { origin: `http://${LOOPBACK}:${port}`, exports: Effect.sync(() => [...received]) }
})
