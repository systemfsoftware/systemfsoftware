import { NodeSocket } from '@effect/platform-node'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Schedule from 'effect/Schedule'
import type * as Scope from 'effect/Scope'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import type * as Socket from 'effect/unstable/socket/Socket'

import { ChildProcessCrashedError, WorkerConnectTimeoutError } from './Worker.schema.js'

/** How long the parent retries the connection while a worker boots. */
export const connectRetry = Schedule.min([Schedule.spaced(50), Schedule.recurs(100)])

/**
 * One worker child process and the client protocol layer that talks to it.
 *
 * The child hosts the RPC server on a `net` `path` endpoint — a socket file
 * in the worker directory on POSIX, a same-user named pipe on Windows. The
 * parent picks the address and passes it through the environment, so there is
 * no port handshake and no ephemeral port.
 */
export interface SpawnedSocketWorker {
  readonly pid: number
  readonly clientLayer: Layer.Layer<RpcClient.Protocol, Socket.SocketError>
}

/**
 * Spawn a worker child process and return the layer that connects to it.
 *
 * The child process is scoped: closing the acquisition scope terminates it,
 * which is the lifetime the pool already relies on.
 */
export const spawnSocketWorker = (params: {
  readonly entryUrl: URL
  readonly workingDirectory: string
  readonly execArgv: readonly string[]
  readonly optionsJson: string
  readonly tempDirPrefix: string
}): Effect.Effect<
  SpawnedSocketWorker,
  ChildProcessCrashedError | WorkerConnectTimeoutError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
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
    })

    const clientLayer = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
      Layer.provide(NodeSocket.layerNet({ path: socketPath })),
      Layer.provide(RpcSerialization.layerNdjson),
    )

    return { pid: Number(handle.pid), clientLayer }
  }).pipe(
    Effect.catch((error) => {
      if (error instanceof ChildProcessCrashedError || error instanceof WorkerConnectTimeoutError) {
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
  )
