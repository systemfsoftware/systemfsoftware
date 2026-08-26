import * as NodeSocketServer from '@effect/platform-node-shared/NodeSocketServer'
import * as Socket from 'effect/unstable/socket/Socket'
import * as SocketServer from 'effect/unstable/socket/SocketServer'

import { Wire } from '@systemfsoftware/effect-cell-types'
import type { FileDescriptions } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Schema as S } from 'effect'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { PlatformError } from 'effect/PlatformError'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

import {
  ChildProcessCrashedError,
  OutOfMemoryError,
  WorkerConnectTimeoutError,
  WorkerFrameTooLargeError,
  WorkerMethodError,
  WorkerSocketListenFailed,
  WorkerSocketNotTcpError,
} from './Worker.schema.js'

export const DELIMITER = '\n'

/**
 * Maximum bytes for one `\n`-delimited JSON frame on the worker IPC socket.
 *
 * Both parent and child import this single constant so the wire cannot
 * disagree. Value is 16 MiB — the largest legitimate frame is a
 * `CompleteDryRunResult` with `mutantCoverage.perTest` for a large project:
 * ~10k tests × ~200 B + ~2 MiB coverage + ~30 % JSON overhead ≈ 5–6 MiB,
 * plus a large `failureMessage` stack (hundreds of KB). 16 MiB gives
 * >2× headroom over that estimate while staying orders of magnitude below
 * V8's ~1 GiB string limit that the unbounded `buffer += chunk` would hit.
 */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024
// IPC args/return values cross the process boundary as JSON — recursive JSON value
const JsonValue: Wire.Minted<unknown, unknown> = Wire.suspend(() =>
  Wire.union(
    Wire.string,
    Wire.number,
    Wire.boolean,
    Wire.mint(S.Null),
    Wire.array(JsonValue),
    Wire.record(Wire.string, JsonValue),
  )
)
export const WorkerCallSchema = Wire.wire({
  kind: Wire.literal('call'),
  id: Wire.integer,
  method: Wire.string,
  args: Wire.array(JsonValue),
})
export type WorkerCall = typeof WorkerCallSchema.Type

export const WorkerReplySuccessSchema = Wire.wire({
  kind: Wire.literal('reply'),
  id: Wire.integer,
  success: Wire.literal(true),
  value: Wire.optional(JsonValue),
})
export type WorkerReplySuccess = typeof WorkerReplySuccessSchema.Type

export const WorkerReplyFailureSchema = Wire.wire({
  kind: Wire.literal('reply'),
  id: Wire.integer,
  success: Wire.literal(false),
  error: Wire.mint(WorkerMethodError),
})

export const WorkerReplySchema = Wire.union(WorkerReplySuccessSchema, WorkerReplyFailureSchema)
export type WorkerReply = typeof WorkerReplySchema.Type

export const WorkerMessageSchema = Wire.union(WorkerCallSchema, WorkerReplySchema)
export type WorkerMessage = typeof WorkerMessageSchema.Type

/**
 * How a child process ended.
 */
export const ChildExit = Wire.union(
  Wire.wire({ _tag: Wire.literal('Code'), code: Wire.integer }),
  Wire.wire({ _tag: Wire.literal('Signal'), signal: Wire.string }),
)
export type ChildExit = typeof ChildExit.Type
export interface IdGeneratorShape {
  readonly next: Effect.Effect<number>
}

export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  '@systemfsoftware/stryker-js-platform-node/IdGenerator',
) {}

export const makeIdGenerator: Effect.Effect<IdGeneratorShape> = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  return {
    next: Ref.getAndUpdate(ref, (n) => n + 1),
  }
})

export const layer = Layer.effect(IdGenerator)(makeIdGenerator)

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

export const getAvailableParallelism = (): number => {
  if (typeof globalThis.navigator === 'undefined') return 4
  const hc = globalThis.navigator.hardwareConcurrency
  if (typeof hc !== 'number') return 4
  return hc
}

export const computeTotalConcurrencyDetails = (
  concurrencyOption: number | string | undefined,
  availableParallelism: number,
): { readonly total: number; readonly isPercentage: boolean } => {
  if (typeof concurrencyOption === 'string') {
    const percentageMatch = concurrencyOption.match(/^(100|[1-9]?[0-9])%$/)
    if (percentageMatch?.[1] !== undefined) {
      const percentage = Number.parseInt(percentageMatch[1], 10)
      return { total: Math.max(1, Math.round((availableParallelism * percentage) / 100)), isPercentage: true }
    }
  }
  if (typeof concurrencyOption === 'number') {
    return { total: concurrencyOption, isPercentage: false }
  }
  if (availableParallelism > 4) {
    return { total: availableParallelism - 1, isPercentage: false }
  }
  return { total: availableParallelism, isPercentage: false }
}

export const computeTotalConcurrency = (
  concurrencyOption: number | string | undefined,
  availableParallelism: number,
): number => computeTotalConcurrencyDetails(concurrencyOption, availableParallelism).total

export const splitConcurrency = (
  total: number,
  checkerCount: number,
): { testRunners: number; checkers: number } => {
  if (checkerCount > 0) {
    return {
      checkers: Math.max(Math.ceil(total / 2), 1),
      testRunners: Math.max(Math.floor(total / 2), 1),
    }
  }
  return { testRunners: total, checkers: 0 }
}

export const computeConcurrency = (
  options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
  availableParallelism: number,
): { testRunners: number; checkers: number } => {
  const total = computeTotalConcurrency(options.concurrency, availableParallelism)
  return splitConcurrency(total, options.checkers.length)
}

export const makeConcurrency = (
  options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
): Effect.Effect<{ testRunners: number; checkers: number }> =>
  Effect.gen(function*() {
    const availableParallelism = yield* Effect.sync(getAvailableParallelism)
    const { total, isPercentage } = computeTotalConcurrencyDetails(options.concurrency, availableParallelism)
    if (isPercentage) {
      yield* Effect.logDebug(
        `Computed concurrency ${total} from "${options.concurrency}" based on ${availableParallelism} available parallelism.`,
      )
    }
    const result = splitConcurrency(total, options.checkers.length)
    if (options.checkers.length > 0) {
      yield* Effect.logInfo(
        `Creating ${result.checkers} checker process(es) and ${result.testRunners} test runner process(es).`,
      )
    } else {
      yield* Effect.logInfo(`Creating ${result.testRunners} test runner process(es).`)
    }
    return result
  })

// ---------------------------------------------------------------------------
// IPC transport
// ---------------------------------------------------------------------------

/**
 * Resolve the worker entry through the package's `exports` subpaths.
 */
export const resolveWorkerMainPath: Effect.Effect<string> = Effect.sync(() => {
  try {
    const resolved = import.meta.resolve(
      '@systemfsoftware/stryker-js-platform-node/internal/child-process-proxy-worker-main',
    )
    if (resolved.startsWith('file://')) {
      return new URL(resolved).pathname
    }
    return resolved
  } catch {
    return new URL('./WorkerMain.ts', import.meta.url).pathname
  }
})

export { ChildProcessSpawner }

// ---------------------------------------------------------------------------
// Child-process proxy
// ---------------------------------------------------------------------------

const DISPOSE_TIMEOUT_MS = 2000

/** How long the parent waits for a spawned worker to connect back. */
const CONNECT_TIMEOUT_MS = 5000

type _IsPromiseFunction<T> = T extends (...args: infer _A) => Promise<infer _R> ? true : false

export type Proxied<T> = {
  [K in keyof T as _IsPromiseFunction<T[K]> extends true ? K : never]: T[K] extends (
    ...args: infer A
  ) => Promise<infer R>
    ? (...args: A) => Effect.Effect<R, WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError, never>
    : never
}

export interface ChildProcessProxyShape<T> {
  readonly proxy: Proxied<T>
  readonly stdout: Effect.Effect<string>
  readonly stderr: Effect.Effect<string>
  readonly dispose: Effect.Effect<void>
  readonly pid: number
}

/** Every way acquiring a worker can fail before it is usable. */
export type ChildProcessProxyError =
  | WorkerSocketNotTcpError
  | WorkerSocketListenFailed
  | WorkerConnectTimeoutError
  | PlatformError

export const makeChildProcessProxy = <T>(params: {
  modulePath: string
  namedExport: string
  options: StrykerOptions
  fileDescriptions: FileDescriptions
  pluginModulePaths: readonly string[]
  workingDirectory: string
  execArgv: readonly string[]
  idGenerator: IdGeneratorShape
}): Effect.Effect<
  ChildProcessProxyShape<T>,
  ChildProcessProxyError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const stdoutRef = yield* Ref.make('')
    const stderrRef = yield* Ref.make('')
    const stdoutQueue = yield* Queue.unbounded<string>()
    const stderrQueue = yield* Queue.unbounded<string>()
    const pendingRef = yield* Ref.make<
      Record<
        number,
        Deferred.Deferred<
          unknown,
          WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError | WorkerFrameTooLargeError
        >
      >
    >({})
    const idRef = yield* Ref.make(0)
    const socketRef = yield* Ref.make<Socket.Socket | undefined>(undefined)
    const serverRef = yield* Ref.make<SocketServer.SocketServer['Service'] | undefined>(undefined)
    const writerRef = yield* Ref.make<
      ((chunk: string | Uint8Array | Socket.CloseEvent) => Effect.Effect<void, Socket.SocketError>) | undefined
    >(undefined)
    const connectedDeferred = yield* Deferred.make<void, never>()
    const rawExitDeferred = yield* Deferred.make<readonly [number | null, NodeJS.Signals | null], never>()
    const workerId = (yield* params.idGenerator.next).toString()
    const workerMainPath = yield* resolveWorkerMainPath

    const MAX_OUTPUT_CHARS = 4096
    const appendCapped = (existing: string, chunk: string): string => {
      const next = existing + chunk
      if (next.length > MAX_OUTPUT_CHARS) {
        return next.slice(-MAX_OUTPUT_CHARS)
      }
      return next
    }
    let spawnedHandle: ChildProcessSpawner.ChildProcessHandle | undefined
    const context = yield* Effect.context<never>()
    const runFork = Effect.runForkWith(context)
    yield* Effect.forkScoped(
      Effect.forever(
        Queue.take(stdoutQueue).pipe(
          Effect.flatMap((chunk) => Ref.update(stdoutRef, (existing) => appendCapped(existing, chunk))),
        ),
      ),
    )
    yield* Effect.forkScoped(
      Effect.forever(
        Queue.take(stderrQueue).pipe(
          Effect.flatMap((chunk) =>
            Ref.update(stderrRef, (existing) => appendCapped(existing, chunk)).pipe(
              Effect.andThen(() => Effect.logWarning(`worker stderr: ${chunk.trimEnd()}`)),
            )
          ),
        ),
      ),
    )

    const drainPendingOnSocketClose = Effect.gen(function*() {
      const pending = yield* Ref.getAndSet(pendingRef, {})
      const ids = Object.keys(pending)
      if (ids.length === 0) return
      const stdout = yield* Ref.get(stdoutRef)
      const stderr = yield* Ref.get(stderrRef)
      const combined = stdout + stderr
      const isOom = combined.includes('JavaScript heap out of memory') || combined.includes('FatalProcessOutOfMemory')
      let pid: number
      if (spawnedHandle !== undefined) {
        pid = Number(spawnedHandle.pid)
      } else {
        pid = 0
      }
      const exitOption = yield* Deferred.await(rawExitDeferred).pipe(Effect.timeoutOption(500))
      let exit: ChildExit
      if (Option.isSome(exitOption)) {
        const [code, signal] = exitOption.value
        if (signal !== null) {
          exit = { _tag: 'Signal' as const, signal }
        } else {
          exit = { _tag: 'Code' as const, code: code ?? 1 }
        }
      } else {
        exit = { _tag: 'Code' as const, code: 1 }
      }
      let maybeSignal: NodeJS.Signals | null
      if (Option.isSome(exitOption)) {
        maybeSignal = exitOption.value[1]
      } else {
        maybeSignal = null
      }
      let cause: string
      if (maybeSignal !== null) {
        let suffix = ''
        if (combined.length > 0) {
          suffix = `\n${combined.slice(0, 2000)}`
        }
        cause = `the worker was killed by signal ${maybeSignal}${suffix}`
      } else {
        cause = combined.slice(0, 2000) || 'socket closed without exit status'
      }
      if (isOom) {
        let exitCode: number
        if (Option.isSome(exitOption)) {
          const code = exitOption.value[0]
          if (code !== null) {
            exitCode = code
          } else {
            exitCode = 1
          }
        } else {
          exitCode = 1
        }
        const err = new OutOfMemoryError({ pid, exitCode })
        for (const k of ids) {
          const d = pending[Number(k)]
          if (d !== undefined) yield* Deferred.fail(d, err)
        }
      } else {
        const err = new ChildProcessCrashedError({ pid, exit, cause })
        for (const k of ids) {
          const d = pending[Number(k)]
          if (d !== undefined) yield* Deferred.fail(d, err)
        }
      }
    })
    const server = yield* NodeSocketServer.make({ host: '127.0.0.1', port: 0 }).pipe(
      Effect.mapError((cause) => new WorkerSocketListenFailed({ cause })),
    )
    yield* Ref.set(serverRef, server)
    const address = server.address
    const ipcPort = yield* Match.value(address).pipe(
      Match.tag('TcpAddress', (a) => Effect.succeed(a.port)),
      Match.tag('UnixAddress', (a) => Effect.fail(new WorkerSocketNotTcpError({ address: a.path }))),
      Match.exhaustive,
    )
    yield* Effect.forkScoped(
      server.run(
        Effect.fnUntraced(function*(socket: Socket.Socket) {
          const writer = yield* socket.writer
          yield* Ref.set(socketRef, socket)
          yield* Ref.set(writerRef, writer)
          yield* Deferred.succeed(connectedDeferred, undefined)
          let buffer = ''
          const handleChunk = (chunk: string) =>
            Effect.gen(function*() {
              yield* Effect.void
              buffer += chunk
              if (buffer.length > MAX_FRAME_BYTES) {
                const error = new WorkerFrameTooLargeError({
                  byteLength: buffer.length,
                  limit: MAX_FRAME_BYTES,
                })
                const pending = yield* Ref.getAndSet(pendingRef, {})
                for (const k of Object.keys(pending)) {
                  const d = pending[Number(k)]
                  if (d !== undefined) yield* Deferred.fail(d, error).pipe(Effect.ignore)
                }
                yield* writer(new Socket.CloseEvent(1009, `Frame too large: ${buffer.length} > ${MAX_FRAME_BYTES}`))
                  .pipe(
                    Effect.ignore,
                    Effect.orDie,
                  )
                buffer = ''
                return yield* Effect.fail(error)
              }
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
                runFork(
                  Effect.gen(function*() {
                    const decoded = yield* S.decodeUnknownEffect(WorkerReplySchema)(parsed).pipe(
                      Effect.orElseSucceed(() => undefined),
                    )
                    if (decoded === undefined) {
                      return
                    }
                    const d = yield* Ref.modify(pendingRef, (pending) => {
                      const defer = pending[decoded.id]
                      if (defer === undefined) {
                        return [undefined, pending] as const
                      }
                      const next = { ...pending }
                      delete next[decoded.id]
                      return [defer, next] as const
                    })
                    if (d === undefined) {
                      return
                    }
                    if (decoded.success) {
                      yield* Deferred.succeed(d, decoded.value)
                    } else {
                      yield* Deferred.fail(d, decoded.error)
                    }
                  }),
                )
              }
            })
          yield* socket
            .runString(handleChunk)
            .pipe(
              Effect.catchCause(() =>
                Effect.gen(function*() {
                  yield* drainPendingOnSocketClose.pipe(Effect.ignore)
                })
              ),
              Effect.ensuring(drainPendingOnSocketClose.pipe(Effect.ignore)),
            )
        }, Effect.scoped),
      ),
    )
    const fromSource = workerMainPath.endsWith('.ts')
    const importArgs: string[] = []
    if (fromSource) {
      importArgs.push('--import', 'tsx')
    }
    const baseArgs = [
      ...importArgs,
      ...params.execArgv,
      workerMainPath,
      params.modulePath,
      params.namedExport,
      String(ipcPort),
    ]

    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const command = ChildProcess.make('node', baseArgs, {
      cwd: params.workingDirectory,
      env: {
        STRYKER_MUTATOR_WORKER: workerId,
        WORKER_IPC_PORT: String(ipcPort),
      },
      extendEnv: true,
    })
    const handle = yield* spawner.spawn(command)
    spawnedHandle = handle
    // Pump stdout/stderr into queues for OOM detection and capped storage
    yield* Effect.forkScoped(
      Stream.runForEach(handle.stdout.pipe(Stream.decodeText()), (text) => Queue.offer(stdoutQueue, text)),
    )
    yield* Effect.forkScoped(
      Stream.runForEach(handle.stderr.pipe(Stream.decodeText()), (text) => Queue.offer(stderrQueue, text)),
    )
    // Bridge exit to deferreds
    yield* Effect.forkScoped(
      Effect.gen(function*() {
        const exitCode = yield* handle.exitCode.pipe(
          Effect.catch(() => Effect.succeed(ChildProcessSpawner.ExitCode(1))),
        )
        const code = Number(exitCode)
        // platform handle does not expose signal directly; infer signal null
        yield* Deferred.succeed(rawExitDeferred, [code, null] as const)
      }),
    )
    // Bridge spawn errors via exitCode failure? NodeSpawner reports errors as PlatformError on spawn, so handle that

    yield* Deferred.await(connectedDeferred).pipe(
      Effect.timeoutOrElse({
        duration: CONNECT_TIMEOUT_MS,
        orElse: () =>
          Effect.fail(
            new WorkerConnectTimeoutError({
              modulePath: params.modulePath,
              waitedMs: CONNECT_TIMEOUT_MS,
            }),
          ),
      }),
    )

    yield* Effect.forkScoped(
      Effect.flatMap(Deferred.await(rawExitDeferred), ([code, signal]) =>
        Effect.gen(function*() {
          const stdout = yield* Ref.get(stdoutRef)
          const stderr = yield* Ref.get(stderrRef)
          const combined = stdout + stderr
          const isOom = combined.includes('JavaScript heap out of memory') ||
            combined.includes('FatalProcessOutOfMemory')
          const pending = yield* Ref.getAndSet(pendingRef, {})
          const ids = Object.keys(pending)
          if (ids.length === 0) return
          const pid = Number(handle.pid)
          if (isOom) {
            const err = new OutOfMemoryError({ pid, exitCode: code ?? 0 })
            for (const k of ids) {
              const d = pending[Number(k)]
              if (d !== undefined) yield* Deferred.fail(d, err)
            }
          } else {
            let exit: ChildExit
            if (signal !== null) {
              exit = { _tag: 'Signal' as const, signal }
            } else {
              exit = { _tag: 'Code' as const, code: code ?? 1 }
            }
            let cause: string
            if (signal !== null) {
              let suffix = ''
              if (combined.length > 0) {
                suffix = `\n${combined.slice(0, 2000)}`
              }
              cause = `the worker was killed by signal ${signal}${suffix}`
            } else if ((code ?? 0) === 0) {
              let suffix = ''
              if (combined.length > 0) {
                suffix = `\n${combined.slice(0, 2000)}`
              }
              cause = `the worker exited without answering ${ids.length} call(s) with exit code 0${suffix}`
            } else {
              cause = combined.slice(0, 2000)
            }
            const err = new ChildProcessCrashedError({ pid, exit, cause })
            for (const k of ids) {
              const d = pending[Number(k)]
              if (d !== undefined) yield* Deferred.fail(d, err)
            }
          }
        })).pipe(Effect.ignore),
    )

    const proxyTarget: Record<
      string,
      (
        ...args: readonly unknown[]
      ) => Effect.Effect<
        unknown,
        WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError | WorkerFrameTooLargeError
      >
    > = {}

    const handler: ProxyHandler<
      Record<
        string,
        (
          ...args: readonly unknown[]
        ) => Effect.Effect<
          unknown,
          WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError | WorkerFrameTooLargeError
        >
      >
    > = {
      get: (_t, propertyKey) => {
        if (typeof propertyKey !== 'string') return undefined
        return (...args: readonly unknown[]) =>
          Effect.gen(function*() {
            const callId = yield* Ref.modify(idRef, (n) => [n, n + 1] as const)
            const deferred = yield* Deferred.make<
              unknown,
              WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError | WorkerFrameTooLargeError
            >()
            yield* Ref.update(pendingRef, (p) => ({ ...p, [callId]: deferred }))
            const sock = yield* Ref.get(socketRef)
            const writer = yield* Ref.get(writerRef)
            if (sock === undefined || writer === undefined) {
              yield* Ref.update(pendingRef, (p) => {
                const cleaned = { ...p }
                delete cleaned[callId]
                return cleaned
              })
              return yield* new WorkerMethodError({
                message: 'IPC socket not connected',
                name: 'IPCError',
                stack: undefined,
              })
            }
            const frame = JSON.stringify({ kind: 'call', id: callId, method: propertyKey, args: [...args] }) + DELIMITER
            if (frame.length > MAX_FRAME_BYTES) {
              yield* Ref.update(pendingRef, (p) => {
                const cleaned = { ...p }
                delete cleaned[callId]
                return cleaned
              })
              return yield* new WorkerFrameTooLargeError({
                byteLength: frame.length,
                limit: MAX_FRAME_BYTES,
              })
            }
            yield* writer(frame).pipe(
              Effect.tapError(() =>
                Ref.update(pendingRef, (p) => {
                  const cleaned = { ...p }
                  delete cleaned[callId]
                  return cleaned
                })
              ),
              Effect.mapError(() =>
                new WorkerMethodError({
                  message: `Failed to send "${String(propertyKey)}" to the worker`,
                  name: 'IPCError',
                  stack: undefined,
                })
              ),
            )
            yield* Effect.yieldNow
            const result = yield* Deferred.await(deferred)
            return result
          })
      },
    }

    const rawProxy = new Proxy(proxyTarget, handler)
    const declared = S.declare(
      (input: unknown): input is Proxied<T> => input !== null && typeof input === 'object' && !Array.isArray(input),
      { description: 'Proxied worker' },
    )
    const typedProxy = yield* S.decodeUnknownEffect(declared)(rawProxy).pipe(Effect.orDie)

    const dispose: Effect.Effect<void> = Effect.gen(function*() {
      const pending = yield* Ref.getAndSet(pendingRef, {})
      const ids = Object.keys(pending)
      if (ids.length > 0) {
        for (const k of ids) {
          const d = pending[Number(k)]
          if (d !== undefined) {
            yield* Deferred.fail(
              d,
              new ChildProcessCrashedError({
                pid: Number(handle.pid),
                exit: { _tag: 'Code', code: 1 },
                cause: 'disposed',
              }),
            ).pipe(Effect.ignore)
          }
        }
      }
      yield* Ref.set(socketRef, undefined).pipe(Effect.ignore)
      yield* Ref.set(writerRef, undefined).pipe(Effect.ignore)
      yield* handle.kill().pipe(
        Effect.ignore,
        Effect.timeoutOrElse({ duration: DISPOSE_TIMEOUT_MS, orElse: () => Effect.void }),
      )
      // server closed via Scope finalizer from NodeSocketServer.make
    })

    const currentScope = yield* Scope.Scope
    yield* Scope.addFinalizer(currentScope, Effect.ignore(dispose))

    return {
      proxy: typedProxy,
      stdout: Ref.get(stdoutRef),
      stderr: Ref.get(stderrRef),
      dispose,
      pid: Number(handle.pid),
    }
  })
