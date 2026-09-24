import { Effect } from 'effect'

type Field<A = unknown> = A

interface HostSocket {
  readonly write: (data: string) => void
  readonly once: (event: 'data', listener: (data: Field) => void) => void
  readonly end: (data: string) => void
  readonly destroy: () => void
}

interface HostServer {
  readonly listen: (port: number, host: string, onListening: () => void) => void
  readonly address: () => Field
  readonly close: (onClosed: () => void) => void
}

interface HostNet {
  readonly createServer: (onSocket: (socket: HostSocket) => void) => HostServer
  readonly connect: (port: number, host: string, onConnect: () => void) => HostSocket
}

interface HostProcess {
  readonly getBuiltinModule: (name: string) => Field
}

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object' && candidate !== null

const isHostProcess = (candidate: Field): candidate is HostProcess =>
  isHostObject(candidate) && 'getBuiltinModule' in candidate

const isHostNet = (candidate: Field): candidate is HostNet =>
  isHostObject(candidate) && 'createServer' in candidate && 'connect' in candidate

const hostNet = (): HostNet => {
  const host: Field = Reflect.get(globalThis, 'process')
  const loaded: Field = isHostProcess(host) ? host.getBuiltinModule('node:net') : undefined
  if (!isHostNet(loaded)) throw new Error('effect-sim-kernel tests need the node host net module')
  return loaded
}

const portOf = (address: Field): number => {
  const port: Field = isHostObject(address) ? Reflect.get(address, 'port') : undefined
  return typeof port === 'number' ? port : 0
}

export interface AnsweringService {
  readonly port: number
  readonly close: Effect.Effect<void>
}

const closing = (server: HostServer): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void))
  })

export const answeringService: Effect.Effect<AnsweringService> = Effect.callback<AnsweringService>((resume) => {
  const server = hostNet().createServer((socket) => {
    socket.once('data', () => socket.end('pong'))
  })
  server.listen(
    0,
    '127.0.0.1',
    () => resume(Effect.succeed({ port: portOf(server.address()), close: closing(server) })),
  )
})

const connected = (port: number): Effect.Effect<HostSocket> =>
  Effect.callback<HostSocket>((resume) => {
    const socket = hostNet().connect(port, '127.0.0.1', () => resume(Effect.succeed(socket)))
  })

const answerOn = (socket: HostSocket): Effect.Effect<string> =>
  Effect.callback<string>((resume) => {
    socket.once('data', (data) => {
      socket.destroy()
      resume(Effect.succeed(String(data)))
    })
    socket.write('ping')
  })

export const askAfterConnecting = (port: number): Effect.Effect<string> => Effect.flatMap(connected(port), answerOn)
