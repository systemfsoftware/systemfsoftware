import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const LOOPBACK = '127.0.0.1'

export interface ScriptedReply {
  readonly status: number
  readonly body: string
}

export interface RecordedRequest {
  readonly method: string
  readonly path: string
  readonly authorization: string
  readonly body: string
}

export interface OpenAiStub {
  readonly origin: string
  readonly script: (replies: ReadonlyArray<ScriptedReply>) => Effect.Effect<void>
  readonly recorded: Effect.Effect<ReadonlyArray<RecordedRequest>>
}

const UNSCRIPTED: ScriptedReply = {
  status: 500,
  body: JSON.stringify({ error: { message: 'the stub has no scripted reply left', code: 'stub_exhausted' } }),
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

const answer = (response: ServerResponse, reply: ScriptedReply): void => {
  response.writeHead(reply.status, { 'content-type': 'application/json' })
  response.end(reply.body)
}

export const openAiStub: Effect.Effect<OpenAiStub, never, Scope.Scope> = Effect.gen(function*() {
  const queue: Array<ScriptedReply> = []
  const recorded: Array<RecordedRequest> = []
  const server = createServer((request, response) => {
    onBody(request, (body) => {
      recorded.push({
        method: request.method ?? '',
        path: request.url ?? '',
        authorization: request.headers.authorization ?? '',
        body,
      })
      answer(response, queue.shift() ?? UNSCRIPTED)
    })
  })
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return {
    origin: `http://${LOOPBACK}:${port}`,
    script: (replies) => Effect.sync(() => void queue.push(...replies)),
    recorded: Effect.sync(() => [...recorded]),
  }
})

export const refusedOrigin: Effect.Effect<string> = Effect.gen(function*() {
  const server = createServer()
  const port = yield* listened(server)
  yield* closed(server)
  return `http://${LOOPBACK}:${port}`
})
