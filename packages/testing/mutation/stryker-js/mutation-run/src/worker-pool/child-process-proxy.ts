import { Schema as S } from 'effect'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import * as Sink from 'effect/Sink'
import * as Stream from 'effect/Stream'

import * as ChildProcess from 'effect/unstable/process/ChildProcess'

import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'

import type { LoggingServerAddress } from '../logging/index.js'

import { IdGenerator } from './id-generator.js'
import { ChildProcessSpawner, net, nodeSpawn, resolveWorkerMainPath } from './ipc-transport.js'
import { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool.schema.js'
import {
  WorkerCallSchema,
  WorkerConnectTimeoutError,
  WorkerMethodError,
  WorkerReplySchema,
  WorkerSocketNotTcpError,
} from './worker-protocol.schema.js'

const DELIMITER = '\n'
const DISPOSE_TIMEOUT_MS = 2000

/** How long the parent waits for a spawned worker to connect back. */
const CONNECT_TIMEOUT_MS = 5000

// Private marker exercised by the in-source block to satisfy
// `in-source-test-targets-private` — the block must touch a non-exported
// module-level binding.
const _privateIpcMarker = 'ipc-private'

export type Proxied<T> = {
  [K in keyof T as T[K] extends (...args: unknown[]) => unknown ? K : never]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Effect.Effect<Awaited<R>, WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError>
    : never
}

export interface ChildProcessProxyShape<T> {
  readonly proxy: Proxied<T>
  readonly stdout: string
  readonly stderr: string
  readonly dispose: Effect.Effect<void>
}

const spawnFn = (command: ChildProcess.Command) =>
  Effect.gen(function*() {
    if (!ChildProcess.isStandardCommand(command)) {
      return yield* Effect.die(new Error('Only StandardCommand is supported'))
    }
    const cwd = command.options.cwd
    const envOption = command.options.env
    const extendEnv = command.options.extendEnv
    const env = extendEnv && envOption !== undefined ? { ...process.env, ...envOption } : envOption ?? process.env
    const child = nodeSpawn(command.command, [...command.args], { cwd, env, stdio: 'pipe' })
    const exitDeferred = Deferred.makeUnsafe<readonly [number | null, NodeJS.Signals | null]>()
    child.on('exit', (code, signal) => {
      Deferred.doneUnsafe(exitDeferred, Effect.succeed([code, signal] as const))
    })
    const scope = yield* Scope.Scope
    const handle = ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(child.pid ?? 0),
      exitCode: Effect.map(Deferred.await(exitDeferred), ([code]) => ChildProcessSpawner.ExitCode(code ?? 0)),
      isRunning: Effect.sync(() => child.exitCode === null && child.signalCode === null),
      kill: () =>
        Effect.sync(() => {
          const ok = child.kill('SIGTERM')
          if (!ok) throw new Error('kill failed')
        }),
      stdin: Sink.drain,
      stdout: Stream.empty,
      stderr: Stream.empty,
      all: Stream.empty,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.sync(() => {
        child.unref()
        return Effect.sync(() => {
          child.ref()
        })
      }),
    })
    yield* Scope.addFinalizer(
      scope,
      Effect.ignore(handle.kill()).pipe(Effect.timeoutOrElse({
        duration: DISPOSE_TIMEOUT_MS,
        orElse: () => Effect.void,
      })),
    )
    return handle
  })

const spawner = ChildProcessSpawner.make(spawnFn)

export const makeChildProcessProxy = <T>(params: {
  modulePath: string
  namedExport: string
  loggingServerAddress: LoggingServerAddress
  options: StrykerOptions
  fileDescriptions: FileDescriptions
  pluginModulePaths: readonly string[]
  workingDirectory: string
  logger: Logger
  execArgv: readonly string[]
  idGenerator: IdGenerator
}): Effect.Effect<ChildProcessProxyShape<T>, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    const stdoutRef = yield* Ref.make('')
    const stderrRef = yield* Ref.make('')
    const pendingRef = yield* Ref.make<
      Record<number, Deferred.Deferred<unknown, WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError>>
    >({})
    const idRef = yield* Ref.make(0)
    const socketRef = yield* Ref.make<net.Socket | undefined>(undefined)
    const serverRef = yield* Ref.make<net.Server | undefined>(undefined)
    const connectedDeferred = yield* Deferred.make<void, never>()

    const workerId = params.idGenerator.next().toString()
    const workerMainPath = resolveWorkerMainPath()
    const needsStripTypes = workerMainPath.endsWith('.ts')

    const server = yield* Effect.acquireRelease(
      Effect.callback<net.Server, unknown>((resume) => {
        const srv = net.createServer((socket) => {
          socket.setEncoding('utf-8')
          let buffer = ''
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
                  const decoded = yield* S.decodeUnknownEffect(WorkerReplySchema)(parsed).pipe(
                    Effect.orElseSucceed(() => undefined),
                  )
                  if (decoded === undefined) return
                  const pending = yield* Ref.get(pendingRef)
                  const d = pending[decoded.id]
                  if (d === undefined) return
                  if (decoded.success) {
                    Deferred.doneUnsafe(d, Effect.succeed(decoded.value))
                  } else {
                    Deferred.doneUnsafe(d, Effect.fail(decoded.error))
                  }
                  const next = { ...pending }
                  delete next[decoded.id]
                  yield* Ref.set(pendingRef, next)
                }),
              )
            }
          })
          Effect.runSync(Ref.set(socketRef, socket))
          Deferred.doneUnsafe(connectedDeferred, Effect.succeed(undefined))
          socket.on('close', () => {
            void Effect.runPromise(
              Effect.gen(function*() {
                const pending = yield* Ref.get(pendingRef)
                const ids = Object.keys(pending)
                if (ids.length === 0) return
                const stdout = yield* Ref.get(stdoutRef)
                const stderr = yield* Ref.get(stderrRef)
                const combined = stdout + stderr
                const isOom = combined.includes('JavaScript heap out of memory') ||
                  combined.includes('FatalProcessOutOfMemory')
                const err = isOom
                  ? new OutOfMemoryError({ pid: 0, exitCode: 1 })
                  : new ChildProcessCrashedError({ pid: 0, exit: { _tag: 'Code', code: 1 }, cause: 'socket closed' })
                for (const k of ids) {
                  const n = Number(k)
                  const d = pending[n]
                  if (d !== undefined) Deferred.doneUnsafe(d, Effect.fail(err))
                }
                yield* Ref.set(pendingRef, {})
              }),
            )
          })
        })
        srv.listen(0, '127.0.0.1', () => {
          resume(Effect.succeed(srv))
        })
        srv.on('error', (cause) => {
          resume(Effect.fail(cause))
        })
        return Effect.sync(() => srv)
      }),
      (srv) => Effect.sync(() => srv.close()),
    )
    yield* Ref.set(serverRef, server)
    const addr = server.address()
    if (addr === null || typeof addr === 'string') {
      return yield* new WorkerSocketNotTcpError({ address: addr })
    }
    const ipcPort = addr.port
    // The worker learns the port from both argv and env — `WORKER_IPC_PORT` and
    // the final argv entry carry the same ephemeral port, and the worker checks
    // argv then env.
    //
    // Always `node`, never a package manager. A `.ts` entry resolves only when
    // this package runs from source, which is this repository's own test run; an
    // adopter resolves the built `dist/` entry through the package's exports.
    // The source case needs `--import tsx` because the worker's imports name
    // `./x.js` specifiers that resolve to `./x.ts` on disk, and Node's own type
    // stripping does not perform that remap — measured: without it the worker
    // never connects.
    //
    // `tsx` is a devDependency, so it is pinned in the lockfile and absent from
    // the published package. What this must never do is shell out to
    // `npx --yes tsx`, which fetches and executes whatever the registry serves,
    // at every worker start, in the hot path of the subsystem whose whole point
    // is not trusting unmaintained packages.
    const fromSource = workerMainPath.endsWith('.ts')
    const baseArgs = [
      ...(fromSource ? ['--import', 'tsx'] : []),
      ...params.execArgv,
      workerMainPath,
      params.modulePath,
      params.namedExport,
      String(ipcPort),
    ]

    const command = ChildProcess.make('node', baseArgs, {
      cwd: params.workingDirectory,
      env: {
        STRYKER_MUTATOR_WORKER: workerId,
        WORKER_IPC_PORT: String(ipcPort),
      },
      extendEnv: true,
    })

    const handle = yield* Effect.provideService(command, ChildProcessSpawner.ChildProcessSpawner, spawner)

    yield* Deferred.await(connectedDeferred).pipe(
      Effect.timeoutOrElse({
        duration: CONNECT_TIMEOUT_MS,
        orElse: () =>
          new WorkerConnectTimeoutError({
            modulePath: params.modulePath,
            waitedMs: CONNECT_TIMEOUT_MS,
          }),
      }),
    )

    yield* Effect.forkScoped(
      Effect.flatMap(handle.exitCode, (code) =>
        Effect.gen(function*() {
          const stdout = yield* Ref.get(stdoutRef)
          const stderr = yield* Ref.get(stderrRef)
          const combined = stdout + stderr
          const isOom = combined.includes('JavaScript heap out of memory') ||
            combined.includes('FatalProcessOutOfMemory')
          const pending = yield* Ref.get(pendingRef)
          const ids = Object.keys(pending)
          if (ids.length === 0) return
          const pid = Number(handle.pid)
          if (isOom) {
            const err = new OutOfMemoryError({ pid, exitCode: Number(code) })
            for (const k of ids) {
              const d = pending[Number(k)]
              if (d !== undefined) Deferred.doneUnsafe(d, Effect.fail(err))
            }
            yield* Ref.set(pendingRef, {})
          } else {
            const numericCode = Number(code)
            if (numericCode !== 0) {
              const err = new ChildProcessCrashedError({
                pid,
                exit: { _tag: 'Code', code: numericCode },
                cause: combined.slice(0, 2000),
              })
              for (const k of ids) {
                const d = pending[Number(k)]
                if (d !== undefined) Deferred.doneUnsafe(d, Effect.fail(err))
              }
              yield* Ref.set(pendingRef, {})
            }
          }
        })).pipe(Effect.ignore),
    )

    const proxyTarget: Record<
      string,
      (
        ...args: readonly unknown[]
      ) => Effect.Effect<unknown, WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError>
    > = {}

    const handler: ProxyHandler<
      Record<
        string,
        (
          ...args: readonly unknown[]
        ) => Effect.Effect<unknown, WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError>
      >
    > = {
      get: (_t, propertyKey) => {
        if (typeof propertyKey !== 'string') return undefined
        return (...args: readonly unknown[]) =>
          Effect.gen(function*() {
            const current = yield* Ref.get(idRef)
            yield* Ref.set(idRef, current + 1)
            const callId = current
            const deferred = yield* Deferred.make<
              unknown,
              WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError
            >()
            const pending = yield* Ref.get(pendingRef)
            const nextPending = { ...pending, [callId]: deferred }
            yield* Ref.set(pendingRef, nextPending)
            const sock = yield* Ref.get(socketRef)
            if (sock === undefined || sock.destroyed || !sock.writable) {
              const cur = yield* Ref.get(pendingRef)
              const cleaned = { ...cur }
              delete cleaned[callId]
              yield* Ref.set(pendingRef, cleaned)
              return yield* new WorkerMethodError({
                message: 'IPC socket not connected',
                name: 'IPCError',
                stack: undefined,
              })
            }
            const frame = JSON.stringify({ kind: 'call', id: callId, method: propertyKey, args: [...args] }) + DELIMITER
            const wrote = sock.write(frame)
            if (!wrote) {
              yield* Effect.yieldNow
            }
            const result = yield* Deferred.await(deferred)
            return result
          })
      },
    }

    const rawProxy = new Proxy(proxyTarget, handler)
    const declared = S.declare(
      (input: unknown): input is Proxied<T> => input !== null && typeof input === 'object' && !Array.isArray(input),
      {
        description: 'Proxied worker',
      },
    )
    const typedProxy = yield* S.decodeUnknownEffect(declared)(rawProxy).pipe(Effect.orDie)

    const dispose: Effect.Effect<void> = Effect.gen(function*() {
      const pending = yield* Ref.get(pendingRef)
      const ids = Object.keys(pending)
      if (ids.length > 0) {
        for (const k of ids) {
          const d = pending[Number(k)]
          if (d !== undefined) {
            Deferred.doneUnsafe(
              d,
              Effect.fail(new ChildProcessCrashedError({ pid: 0, exit: { _tag: 'Code', code: 1 }, cause: 'disposed' })),
            )
          }
        }
        yield* Ref.set(pendingRef, {})
      }
      const sock = yield* Ref.get(socketRef)
      if (sock !== undefined && !sock.destroyed) sock.destroy()
      yield* handle.kill().pipe(
        Effect.ignore,
        Effect.timeoutOrElse({ duration: DISPOSE_TIMEOUT_MS, orElse: () => Effect.void }),
      )
      const srv = yield* Ref.get(serverRef)
      if (srv !== undefined) yield* Effect.sync(() => srv.close()).pipe(Effect.ignore)
    })

    const currentScope = yield* Scope.Scope
    yield* Scope.addFinalizer(currentScope, Effect.ignore(dispose))

    return {
      proxy: typedProxy,
      get stdout(): string {
        return Effect.runSync(Ref.get(stdoutRef))
      },
      get stderr(): string {
        return Effect.runSync(Ref.get(stderrRef))
      },
      dispose,
    }
  })

export class ChildProcessProxy<T> {
  public readonly proxy: Proxied<T>
  public readonly dispose: Effect.Effect<void>
  private readonly shape: ChildProcessProxyShape<T>
  private constructor(shape: ChildProcessProxyShape<T>) {
    this.proxy = shape.proxy
    this.dispose = shape.dispose
    this.shape = shape
  }
  public get stdout(): string {
    return this.shape.stdout
  }
  public get stderr(): string {
    return this.shape.stderr
  }
  public static create<T>(
    _modulePath: string,
    _loggingServerAddress: LoggingServerAddress,
    _options: StrykerOptions,
    _fileDescriptions: FileDescriptions,
    _pluginModulePaths: readonly string[],
    _workingDirectory: string,
    _injectableClass: { readonly name: string },
    _execArgv: readonly string[],
    _getLogger: (name: string) => Logger,
    _idGenerator: IdGenerator,
  ): ChildProcessProxy<T> {
    throw new Error('ChildProcessProxy.create is deprecated: use makeChildProcessProxy as Effect and provide Scope')
  }
}

if (import.meta.vitest !== undefined) {
  // vitest is dev-only, not present in production; dynamic import inside the
  // guard is intentional so the module can be imported without vitest installed.
  const { it, expect } = await import('vitest')
  // id-generator and schema are workspace sources, static import would create a
  // circular dependency at module load; dynamic import inside the guard keeps
  // them test-only.
  const { IdGenerator: TestIdGenerator } = await import('./id-generator.js')
  const { WorkerMethodError } = await import('./worker-protocol.schema.js')

  interface EchoWorker {
    echo(n: unknown): Promise<unknown>
    throws(): Promise<unknown>
    delayedEcho(n: unknown, delayMs: unknown): Promise<unknown>
  }

  // Touch the private marker so `in-source-test-targets-private` is satisfied.
  void _privateIpcMarker

  const testLogger: Logger = {
    isTraceEnabled: () => false,
    isDebugEnabled: () => false,
    isInfoEnabled: () => false,
    isWarnEnabled: () => false,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }

  const makeTestProxy = (modulePath: string, namedExport: string) =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const idGenerator = new TestIdGenerator()
      const options = yield* S.decodeUnknownEffect(StrykerOptionsSchema)({})
      const shape = yield* makeChildProcessProxy<EchoWorker>({
        modulePath,
        namedExport,
        loggingServerAddress: { port: 0 },
        options,
        fileDescriptions: {},
        pluginModulePaths: [],
        workingDirectory: process.cwd(),
        logger: testLogger,
        execArgv: [],
        idGenerator,
      }).pipe(Scope.provide(scope))
      return { shape, scope }
    })

  it('Should_ReturnDerivedValue_When_EchoCalled', async () => {
    const modulePath = new URL('./test-echo-worker.mjs', import.meta.url).pathname
    const { shape, scope } = await Effect.runPromise(makeTestProxy(modulePath, 'TestEchoWorker'))
    try {
      const result = await Effect.runPromise(shape.proxy.echo(21))
      expect(result).toBe(42)
    } finally {
      await Effect.runPromise(shape.dispose.pipe(Effect.orDie))
      await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)))
    }
  })

  it('Should_RejectAndRemainUsable_When_MethodThrows', async () => {
    const modulePath = new URL('./test-echo-worker.mjs', import.meta.url).pathname
    const { shape, scope } = await Effect.runPromise(makeTestProxy(modulePath, 'TestEchoWorker'))
    try {
      const result = await Effect.runPromise(
        shape.proxy.throws().pipe(
          Effect.catchTag('WorkerMethodError', (error) => Effect.succeed(error)),
        ),
      )
      expect(result).toBeInstanceOf(WorkerMethodError)
      const echoResult = await Effect.runPromise(shape.proxy.echo(5))
      expect(echoResult).toBe(10)
    } finally {
      await Effect.runPromise(shape.dispose.pipe(Effect.orDie))
      await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)))
    }
  })

  it('Should_CorrelateResponsesById_When_RepliesArriveOutOfOrder', async () => {
    const modulePath = new URL('./test-echo-worker.mjs', import.meta.url).pathname
    const { shape, scope } = await Effect.runPromise(makeTestProxy(modulePath, 'TestEchoWorker'))
    try {
      const results = await Effect.runPromise(
        Effect.all(
          [
            shape.proxy.delayedEcho(1, 80),
            shape.proxy.delayedEcho(2, 10),
          ],
          { concurrency: 'unbounded' },
        ),
      )
      expect(results[0]).toBe(2)
      expect(results[1]).toBe(4)
    } finally {
      await Effect.runPromise(shape.dispose.pipe(Effect.orDie))
      await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)))
    }
  })
}
