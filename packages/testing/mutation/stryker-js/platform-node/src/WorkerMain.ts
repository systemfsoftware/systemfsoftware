/**
 * WorkerMain — spawned worker entrypoint.
 *
 * Spawned as its own process via `node WorkerMain.mjs <module> <export> <port>`.
 * Connects back to the parent's IPC socket and dispatches JSON-framed calls.
 * Must stay its own emitted entry so `resolveWorkerMainPath` can spawn it by path.
 */

import * as NodeSocket from '@effect/platform-node-shared/NodeSocket'
import { Schema as S } from 'effect'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { causeText } from '@systemfsoftware/stryker-js/Mutant'

import { DELIMITER, WorkerCallSchema } from './Worker.js'
import { WorkerMethodError } from './Worker.schema.js'

const messageOf = (cause: unknown): string => {
  const text = causeText(cause, 0)
  if (text !== undefined && text.length > 0) return text
  if (cause instanceof Error && cause.stack !== undefined && cause.stack.length > 0) return cause.stack
  return Cause.pretty(Cause.fail(cause))
}

const errorStack = (cause: unknown): string | undefined => {
  if (cause instanceof Error) return cause.stack
  return undefined
}

const errorName = (cause: unknown): string | undefined => {
  if (cause instanceof Error) return cause.name
  return undefined
}

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
        message: messageOf(cause),
        name: 'LoadError',
        stack: errorStack(cause),
      }),
  }).pipe(Effect.orElseSucceed(() => ({})))

  if (ipcPort === 0) return

  const socket = yield* NodeSocket.makeNet({ host: '127.0.0.1', port: ipcPort })

  return yield* Effect.scoped(
    Effect.gen(function*() {
      const writer = yield* socket.writer
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
            yield* writer(JSON.stringify(reply) + DELIMITER).pipe(Effect.ignore)
            return
          }
          const result: unknown = yield* Effect.tryPromise({
            try: () => Promise.resolve(Reflect.apply(member, subject, call.args)),
            catch: (cause) =>
              new WorkerMethodError({
                message: messageOf(cause),
                name: errorName(cause),
                stack: errorStack(cause),
              }),
          })
          const successReply = { kind: 'reply' as const, id: call.id, success: true as const, value: result }
          yield* writer(JSON.stringify(successReply) + DELIMITER).pipe(Effect.ignore)
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function*() {
              const failure = Cause.findErrorOption(cause)
              let err: WorkerMethodError
              if (Option.isSome(failure) && failure.value instanceof WorkerMethodError) {
                err = failure.value
              } else {
                err = new WorkerMethodError({
                  message: Cause.pretty(cause),
                  name: 'WorkerError',
                  stack: undefined,
                })
              }
              const reply = { kind: 'reply' as const, id: call.id, success: false as const, error: err }
              yield* writer(JSON.stringify(reply) + DELIMITER).pipe(Effect.ignore)
            })
          ),
        )

      const onChunk = (chunk: string) =>
        Effect.gen(function*() {
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
            yield* Effect.forkChild(
              Effect.gen(function*() {
                const call = yield* S.decodeUnknownEffect(WorkerCallSchema)(parsed).pipe(
                  Effect.orElseSucceed(() => undefined),
                )
                if (call === undefined) return
                yield* handleCall(call)
              }),
            )
          }
        })

      yield* Effect.forkScoped(socket.runString(onChunk))

      return yield* Effect.never
    }),
  )
})

// product output: worker startup failure must reach the exit code and be reported
void Effect.runPromise(main).catch((error) => {
  const wrapped = new Error('Worker startup failed', { cause: error })
  const message = wrapped.stack ?? wrapped.message
  process.stderr.write(message + '\n')
  process.exit(1)
})
