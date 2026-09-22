import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { Effect, Layer, Option, type Scope } from 'effect'
import type * as Socket from 'effect/unstable/socket/Socket'
import type { DialEvidence, HttpEvidence } from '../DialEvidence.schema.js'
import { HostProber } from '../HostProber.js'
import type { PortBinding } from '../Port.schema.js'

const decoder = new TextDecoder()

const textOf = (chunk: string | Uint8Array): string => typeof chunk === 'string' ? chunk : decoder.decode(chunk)

const firstLineOf = (text: string): string => text.split('\r\n')[0] ?? ''

const requestOf = (path: string): string => `GET ${path} HTTP/1.0\r\nHost: ref\r\nConnection: close\r\n\r\n`

const connect = (binding: PortBinding) =>
  Effect.option(NodeSocket.makeNet({ host: binding.host, port: binding.hostPort }))

/**
 * Acquiring the reader is the dial: `makeNet` builds a socket without connecting,
 * so evidence read off the constructed handle would call every port reachable.
 */
const dialEvidenceOf = (socket: Socket.Socket): Effect.Effect<DialEvidence, never, Scope.Scope> =>
  Effect.map(
    Effect.option(socket.reader),
    Option.match({
      onNone: (): DialEvidence => ({ _tag: 'Refused' }),
      onSome: (): DialEvidence => ({ _tag: 'Connected' }),
    }),
  )

const exchangeEvidenceOf = (socket: Socket.Socket, path: string): Effect.Effect<HttpEvidence, never, Scope.Scope> =>
  Effect.option(
    Effect.gen(function*() {
      const writer = yield* socket.writer
      const reader = yield* socket.reader
      yield* writer.write(requestOf(path))
      const chunk = yield* reader.pull
      return firstLineOf(textOf(chunk[0]))
    }),
  ).pipe(
    Effect.map(
      Option.match({
        onNone: (): HttpEvidence => ({ _tag: 'Refused' }),
        onSome: (statusLine: string): HttpEvidence => ({ _tag: 'Responded', statusLine }),
      }),
    ),
  )

export const NodeHostProber = Layer.succeed(HostProber, {
  dial: (binding) =>
    Effect.scoped(
      Effect.flatMap(
        connect(binding),
        Option.match({
          onNone: () => Effect.succeed<DialEvidence>({ _tag: 'Refused' }),
          onSome: dialEvidenceOf,
        }),
      ),
    ),
  exchange: (binding, path) =>
    Effect.scoped(
      Effect.flatMap(
        connect(binding),
        Option.match({
          onNone: () => Effect.succeed<HttpEvidence>({ _tag: 'Refused' }),
          onSome: (socket) => exchangeEvidenceOf(socket, path),
        }),
      ),
    ),
})
