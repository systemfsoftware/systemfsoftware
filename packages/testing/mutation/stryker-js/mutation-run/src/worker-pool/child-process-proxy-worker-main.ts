import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import net from 'node:net'

import { WorkerCallSchema, WorkerMethodError } from './worker-protocol.schema.js'

const DELIMITER = '\n'

const getIpcPort = (): number => {
  const fromArg = process.argv[4] ?? process.argv[3] ?? process.argv[2]
  if (fromArg !== undefined) {
    const n = Number(fromArg)
    if (!Number.isNaN(n)) return n
  }
  const fromEnv = process.env['WORKER_IPC_PORT']
  if (fromEnv !== undefined) {
    const n = Number(fromEnv)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

const getModuleInfo = (): { modulePath: string; namedExport: string } => {
  const modulePath = process.argv[2]
  const namedExport = process.argv[3]
  if (modulePath !== undefined && namedExport !== undefined) {
    return { modulePath, namedExport }
  }
  return { modulePath: '', namedExport: '' }
}

const loadSubject = async (modulePath: string, namedExport: string): Promise<unknown> => {
  if (modulePath === '' || namedExport === '') {
    return {
      echo: (n: unknown) => {
        if (typeof n === 'number') return n * 2
        return n
      },
    }
  }
  const { pathToFileURL } = await import('node:url')
  const mod: unknown = await import(pathToFileURL(modulePath).href)
  if (typeof mod !== 'object' || mod === null) return {}
  if (!(namedExport in mod)) return {}
  const exported: unknown = Reflect.get(mod, namedExport)
  return exported ?? {}
}

const main = Effect.gen(function*() {
  const { modulePath, namedExport } = getModuleInfo()
  const ipcPort = getIpcPort()
  const subject: unknown = yield* Effect.tryPromise({
    try: () => loadSubject(modulePath, namedExport),
    catch: (cause) =>
      new WorkerMethodError({
        message: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'unknown',
        name: 'LoadError',
        stack: undefined,
      }),
  }).pipe(Effect.orElseSucceed(() => ({})))

  if (ipcPort === 0) return

  const socket = yield* Effect.callback<net.Socket, unknown>((resume) => {
    const sock = net.createConnection(ipcPort, '127.0.0.1', () => {
      resume(Effect.succeed(sock))
    })
    sock.on('error', (cause) => {
      resume(Effect.fail(cause))
    })
    return Effect.sync(() => sock)
  })

  socket.setEncoding('utf-8')
  let buffer = ''

  const handleCall = (call: { id: number; method: string; args: readonly unknown[] }) =>
    Effect.gen(function*() {
      let member: unknown
      if (typeof subject === 'object' && subject !== null && call.method in subject) {
        member = Reflect.get(subject, call.method)
      }
      if (typeof member !== 'function') {
        const err = new WorkerMethodError({
          message: `Method ${call.method} not found`,
          name: 'NotFound',
          stack: undefined,
        })
        const reply = { kind: 'reply' as const, id: call.id, success: false as const, error: err }
        socket.write(JSON.stringify(reply) + DELIMITER)
        return
      }
      const result: unknown = yield* Effect.tryPromise({
        try: () => Promise.resolve(Reflect.apply(member, subject, call.args)),
        catch: (cause) =>
          new WorkerMethodError({
            message: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'unknown error',
            name: cause instanceof Error ? cause.name : undefined,
            stack: cause instanceof Error ? cause.stack : undefined,
          }),
      })
      const successReply = { kind: 'reply' as const, id: call.id, success: true as const, value: result }
      socket.write(JSON.stringify(successReply) + DELIMITER)
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          void cause
          const err = new WorkerMethodError({ message: 'Worker method failed', name: 'WorkerError', stack: undefined })
          const reply = { kind: 'reply' as const, id: call.id, success: false as const, error: err }
          socket.write(JSON.stringify(reply) + DELIMITER)
        })
      ),
    )

  socket.on('data', (chunk: string) => {
    buffer += chunk
    let idx = buffer.indexOf(DELIMITER)
    while (idx !== -1) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + DELIMITER.length)
      idx = buffer.indexOf(DELIMITER)
      if (raw.length === 0) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        continue
      }
      void Effect.runPromise(
        Effect.gen(function*() {
          const call = yield* S.decodeUnknownEffect(WorkerCallSchema)(parsed).pipe(
            Effect.orElseSucceed(() => undefined),
          )
          if (call === undefined) return
          void Effect.runPromise(handleCall(call))
        }),
      )
    }
  })

  return yield* Effect.never
})

// product output: worker startup failure must reach the exit code and be reported
void Effect.runPromise(main).catch((error) => {
  console.error(error)
  process.exit(1)
})
