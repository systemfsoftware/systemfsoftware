import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import type * as Scope from 'effect/Scope'
import type * as RpcClient from 'effect/unstable/rpc/RpcClient'
import type * as Socket from 'effect/unstable/socket/Socket'

import { ChildProcessCrashedError } from './Worker.schema.js'

/** Bounded connect attempts while a worker boots: 100 x 50ms. */
export const connectRetry = Schedule.max([Schedule.spaced(50), Schedule.recurs(100)])

/**
 * One worker child process and the client protocol layer that talks to it.
 *
 * The child hosts the RPC server on one address the parent picked; the
 * transport that binds and connects that address is the host's choice. The
 * parent passes the address through the environment, so there is no port
 * handshake and no ephemeral port.
 */
export interface SpawnedSocketWorker {
  readonly pid: number
  readonly clientLayer: Layer.Layer<RpcClient.Protocol, Socket.SocketError>
  /**
   * Fails with `ChildProcessCrashedError` as soon as the child process ends.
   * Race it against the client-layer build so a worker that dies during boot
   * fails the spawn immediately instead of burning the connect budget.
   */
  readonly exited: Effect.Effect<never, ChildProcessCrashedError>
}

/**
 * The worker-launch port: start one worker child running `entryUrl` and
 * return the client protocol layer connected to it.
 *
 * The engine declares this port; the process entry that starts the engine
 * (the CLI) provides the host implementation. Everything host-specific —
 * the executable, the address shape, the socket transport — lives behind
 * this port, so the engine imports no host module.
 */
export interface WorkerLauncherShape {
  readonly spawn: (params: {
    readonly entryUrl: URL
    readonly workingDirectory: string
    readonly execArgv: readonly string[]
    readonly optionsJson: string
    readonly tempDirPrefix: string
  }) => Effect.Effect<SpawnedSocketWorker, ChildProcessCrashedError, Scope.Scope>
}

export class WorkerLauncher extends Context.Service<WorkerLauncher, WorkerLauncherShape>()(
  '@systemfsoftware/stryker-js-engine/WorkerLauncher',
) {}

/**
 * The worker-address port: the URLs of the worker entry files the engine
 * spawns. The engine does not know a host's dist layout, so the process
 * entry provides the addresses its own build emitted.
 */
export interface WorkerEntriesShape {
  readonly checkerWorkerUrl: URL
  readonly testRunnerWorkerUrl: URL
}

export class WorkerEntries extends Context.Service<WorkerEntries, WorkerEntriesShape>()(
  '@systemfsoftware/stryker-js-engine/WorkerEntries',
) {}
