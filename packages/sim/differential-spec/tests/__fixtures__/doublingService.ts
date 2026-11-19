import { Effect } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'

type Field<A = unknown> = A

interface HostResponse {
  readonly end: (body: string) => void
}

interface HostRequest {
  readonly url?: string
}

interface HostServer {
  readonly listen: (port: number, host: string, onListening: () => void) => void
  readonly address: () => Field
  readonly close: (onClosed: () => void) => void
  readonly closeAllConnections: () => void
}

interface HostHttp {
  readonly createServer: (onRequest: (request: HostRequest, response: HostResponse) => void) => HostServer
}

interface HostProcess {
  readonly getBuiltinModule: (name: string) => Field
}

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object' && candidate !== null

const isHostProcess = (candidate: Field): candidate is HostProcess =>
  isHostObject(candidate) && 'getBuiltinModule' in candidate

const isHostHttp = (candidate: Field): candidate is HostHttp => isHostObject(candidate) && 'createServer' in candidate

const hostHttp = (): HostHttp => {
  const host: Field = Reflect.get(globalThis, 'process')
  const loaded: Field = isHostProcess(host) ? host.getBuiltinModule('node:http') : undefined
  if (!isHostHttp(loaded)) throw new Error('differential-spec tests need the node host http module')
  return loaded
}

const portOf = (address: Field): number => {
  const port: Field = isHostObject(address) ? Reflect.get(address, 'port') : undefined
  return typeof port === 'number' ? port : 0
}

const doubled = (request: HostRequest): string =>
  String(Number(new URL(request.url ?? '/', 'http://host').searchParams.get('x')) * 2)

export interface DoublingService {
  readonly origin: string
  readonly close: Effect.Effect<void>
}

const closing = (server: HostServer): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    server.closeAllConnections()
    server.close(() => resume(Effect.void))
  })

/** An HTTP service on the host that answers `/?x=<n>` with twice `n`. */
export const doublingService: Effect.Effect<DoublingService> = Effect.callback<DoublingService>((resume) => {
  const server = hostHttp().createServer((request, response) => response.end(doubled(request)))
  server.listen(
    0,
    '127.0.0.1',
    () => resume(Effect.succeed({ origin: `http://127.0.0.1:${portOf(server.address())}`, close: closing(server) })),
  )
})

/** Asks the service over a real HTTP request for twice `x`. */
export const askedToDouble = (origin: string) => (x: number): Effect.Effect<number> =>
  HttpClient.get(`${origin}/?x=${x}`).pipe(
    Effect.flatMap((response) => response.text),
    Effect.map(Number),
    Effect.orDie,
    Effect.provide(FetchHttpClient.layer),
  )
