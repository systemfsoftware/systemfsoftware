import { NodeFileSystem, NodePath, NodeSocket } from '@effect/platform-node'
import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import { ChildProcessCrashedError, WorkerEntries, WorkerLauncher } from '@systemfsoftware/stryker-js-engine'
import type { EnginePorts, SpawnedSocketWorker } from '@systemfsoftware/stryker-js-engine'
import { Module, type ModuleRequire } from '@systemfsoftware/stryker-js/Module'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import type * as Scope from 'effect/Scope'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'

interface NodeModule {
  createRequire(filename: string | URL): NodeRequire
  isBuiltin(moduleName: string): boolean
}

const makeModuleRequire = (nodeModule: NodeModule, filename: string | URL): ModuleRequire => {
  const requireFrom: NodeRequire = nodeModule.createRequire(filename)
  const requireFn: ModuleRequire = (request: string): unknown => requireFrom(request)
  requireFn.resolve = (request, options) => {
    if (options === undefined) {
      return requireFrom.resolve(request)
    }
    return requireFrom.resolve(request, { paths: [...(options.paths ?? [])] })
  }
  return requireFn
}

/**
 * The Node implementation of the {@link Module} port: every call routes
 * through the runtime's own `node:module` via `process.getBuiltinModule`, so
 * this package imports no host builtins and the import ban holds here too.
 */
export const nodeModuleLayer: Layer.Layer<Module> = Layer.effect(
  Module,
  Effect.sync(() => {
    const nodeModule: NodeModule = process.getBuiltinModule('node:module')
    return {
      createRequire: (filename) => makeModuleRequire(nodeModule, filename),
      isBuiltin: (moduleName) => nodeModule.isBuiltin(moduleName),
    }
  }),
)

/**
 * The worker entries this package's own build emits. The engine spawns by
 * address; this process package knows its dist layout and hands the
 * addresses in.
 */
export const workerEntriesLayer: Layer.Layer<WorkerEntries> = Layer.succeed(WorkerEntries, {
  checkerWorkerUrl: new URL('./workers/checker-worker.mjs', import.meta.url),
  testRunnerWorkerUrl: new URL('./workers/child-process-test-runner-worker.mjs', import.meta.url),
})

/**
 * The Node worker launcher: spawn a worker child with this runtime's
 * executable, host the RPC server's address as a `net` `path` endpoint (a
 * socket file in the worker directory on POSIX, a same-user named pipe on
 * Windows), and connect the NDJSON protocol client over `NodeSocket`.
 */
export const nodeWorkerLauncherLayer: Layer.Layer<
  WorkerLauncher,
  never,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> = Layer.effect(
  WorkerLauncher,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    return {
      spawn: (params): Effect.Effect<SpawnedSocketWorker, ChildProcessCrashedError, Scope.Scope> =>
        Effect.gen(function*() {
          const workerDir = yield* fs.makeTempDirectoryScoped({ prefix: params.tempDirPrefix })
          const socketPath = Match.value(process.platform).pipe(
            Match.when('win32', () => `\\\\.\\pipe\\stryker-worker-${globalThis.crypto.randomUUID()}`),
            Match.orElse(() => path.join(workerDir, 'worker.sock')),
          )
          yield* fs.writeFileString(path.join(workerDir, 'options.json'), params.optionsJson)

          const entryPath = yield* path.fromFileUrl(params.entryUrl)
          const handle = yield* ChildProcess.make(process.execPath, [...params.execArgv, entryPath], {
            cwd: params.workingDirectory,
            extendEnv: true,
            env: { STRYKER_WORKER_DIR: workerDir, STRYKER_SOCKET: socketPath },
            stderr: 'inherit',
          }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

          const clientLayer = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
            Layer.provide(NodeSocket.layerNet({ path: socketPath })),
            Layer.provide(RpcSerialization.layerNdjson),
          )

          const exited = handle.exitCode.pipe(
            Effect.orDie,
            Effect.flatMap((exitCode) =>
              Effect.fail(
                new ChildProcessCrashedError({
                  pid: Number(handle.pid),
                  exit: { _tag: 'Code', code: exitCode },
                  cause: 'worker exited before it accepted the RPC connection',
                }),
              )
            ),
          )

          return { pid: Number(handle.pid), clientLayer, exited }
        }).pipe(
          Effect.catch((error) => {
            if (error instanceof ChildProcessCrashedError) {
              return Effect.fail(error)
            }
            return Effect.fail(
              new ChildProcessCrashedError({
                pid: 0,
                exit: { _tag: 'Code', code: 1 },
                cause: 'worker spawn failed',
              }),
            )
          }),
        ),
    }
  }),
)

export const nodeFsPathLayer: Layer.Layer<FileSystem.FileSystem | Path.Path> = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
)

const nodeSpawnerLayer = NodeChildProcessSpawner.layer.pipe(Layer.provide(nodeFsPathLayer))

const nodeBase = Layer.merge(nodeFsPathLayer, nodeSpawnerLayer)

/**
 * Every port the engine requires, provided from this runtime: the file
 * system, the path service, the module loader, the child-process spawner,
 * the worker launcher, and this build's worker entry addresses.
 */
export const nodePlatformLayer: Layer.Layer<EnginePorts> = Layer.mergeAll(
  nodeModuleLayer,
  workerEntriesLayer,
  nodeWorkerLauncherLayer.pipe(Layer.provide(nodeBase)),
  nodeBase,
)
