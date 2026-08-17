/**
 * The public facade (R3, R12) — a fluent, immutable container builder over
 * the pure spec combinators, and the `RunningContainer` surface of a
 * started container.
 *
 * The builder is immutable copy-on-write: every `with*` returns a NEW
 * `GenericContainer` carrying the modified spec; the original value is
 * never touched (KTD3: the fluent surface sits over the pure combinators —
 * it never IS a mutable builder). `start()` is the only I/O — everything
 * above it is pure data transformation (R2: no I/O at construction).
 *
 * `start()` applies the launch CELL description (see
 * `launch.ts`) through the library interpreter: pre-I/O
 * validation short-circuits with zero backend calls; a successful launch
 * returns a `RunningContainer` whose backend ops (exec/logs/followOutput/
 * copy) read through the `SandboxRuntime` service — the carrier — and
 * whose `stop()`/`remove()` run the shared teardown executor. A
 * `RunningContainer` obtained inside a scope is torn down at scope close
 * (the launch cell registers its teardown finalizer on the enclosing
 * scope); obtained outside a scope, the caller owns the lifetime via
 * `stop()`/`remove()` — the two surfaces are co-equal (R5, KTD5).
 *
 * The `GenericContainer` class itself is the one class the repository's
 * ban-classes gate needs whitelisting for: the fluent builder shape has no
 * class-free equivalent with `new GenericContainer(image)` ergonomics, and
 * the value it carries is pure data (every method returns a fresh
 * instance).
 */
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { Effect } from 'effect'
import type * as Scope from 'effect/Scope'

import {
  type AdoptRunningSeam,
  type LaunchCellError,
  launchContainer,
  type LaunchOptions,
  type RunningHandle,
} from './lifecycle/launch.js'
import type { ContainerSpec, ExecRequest, ExecResult } from './model/container-spec.js'
import { BackendError, RelativeContainerPathError } from './model/errors.js'
import {
  newContainerSpec,
  withCommand,
  withCopyDirectoryToContainer,
  withCopyFileToContainer,
  withDiskLimit,
  withEntrypoint,
  withEnv,
  withExposedPorts,
  withKeepAlive,
  withMemoryLimit,
  withNetwork,
  withNetworkAliases,
  withNetworkDisabled,
  withRequireIsolation,
  withReuse,
  withStartupTimeout,
  withTmpfsRoot,
  withWaitStrategy,
  withWorkingDir,
} from './model/spec-combinators.js'
import type { WaitStrategy } from './model/wait.js'
import type { RightsizeConfig } from './runtime/config.js'
import { SandboxRuntime } from './runtime/runtime.js'
import type { BackendName, FollowHandle, SandboxHandle } from './runtime/runtime.js'
import type { VirtualNetworks } from './runtime/runtime.js'
import type { Selection } from './runtime/selection.workflow.js'

/** The environment a started container's runtime operations require. */
export type ContainerServices = SandboxRuntime | VirtualNetworks | Selection | RightsizeConfig

/**
 * A running container — the dual-surface handle: when obtained under a
 * scope, scope-close tears it down automatically (the launch cell's
 * finalizer); `stop()`/`remove()` tear it down explicitly anywhere. All
 * runtime operations are stateless reads through the `SandboxRuntime`
 * service; the handle carries the durable container id (the byId key, U8).
 */
export interface RunningContainer {
  /** The backend-native handle — the durable container id + the final spec. */
  readonly handle: SandboxHandle
  /** Which backend runs this container. */
  readonly backend: BackendName
  /** The final spec exactly as the backend saw it (runId, derived name, allocated ports). */
  readonly spec: ContainerSpec
  /** Always `127.0.0.1` — every published port binds loopback-only (R9). */
  readonly host: string
  /** The host port bound to `guestPort`, or `undefined` when the port was never exposed/allocated. */
  getMappedPort(guestPort: number): number | undefined
  /** Always `127.0.0.1`. */
  getHost(): string
  /** Runs a one-shot command inside the container and waits for it to exit — exit code is a verdict, never an exception (F3). */
  exec(request: ExecRequest): Effect.Effect<ExecResult, BackendError, RuntimeServices>
  /** Variadic convenience over `exec` — the generic-container one-shot shape. */
  execCommand(...command: string[]): Effect.Effect<ExecResult, BackendError, RuntimeServices>
  /** The workload's logs so far (a bounded tail), as one string — an Effect value, ready to `yield*`. */
  readonly logs: Effect.Effect<string, BackendError, RuntimeServices>
  /** Streams log lines in order, no duplicates; the returned handle stops delivery without flushing (R12). */
  followOutput(consumer: (line: string) => void): Effect.Effect<FollowHandle, BackendError, RuntimeServices>
  /** Copies a host file/directory into the guest, creating the destination's parent first (`cp -r`-style naming). */
  copyFileToContainer(
    hostPath: string,
    containerPath: string,
  ): Effect.Effect<void, RelativeContainerPathError | BackendError, RuntimeServices>
  /** The reverse direction — copies out of the guest, creating the host destination's parent first. */
  copyFileFromContainer(
    containerPath: string,
    hostPath: string,
  ): Effect.Effect<void, RelativeContainerPathError | BackendError, RuntimeServices>
  /** Stops + removes through the shared teardown executor — idempotent, never throws. */
  readonly stop: Effect.Effect<void, never, RuntimeNetworks>
  /** Alias of `stop` on the explicit-release surface. */
  readonly remove: Effect.Effect<void, never, RuntimeNetworks>
}

// The operation environments, so the interface reads names instead of four
// Tag unions.
type RuntimeServices = SandboxRuntime
type RuntimeNetworks = SandboxRuntime | VirtualNetworks

/**
 * The fluent container builder — one immutable value per spec state. Chain
 * `with*` freely; each call returns a NEW instance carrying the new spec,
 * never mutating the receiver.
 *
 * This class name is the ban-classes whitelist entry the leaf AGENTS.md
 * carries: the value it carries is pure data and every method returns a
 * fresh instance — the chained surface KTD3 describes.
 */
export class GenericContainer {
  /** The immutable spec this instance carries — visible for inspection/JSON round-trips. */
  readonly spec: ContainerSpec

  /** Builds against `image` (e.g. `"redis:8.6-alpine"`); no I/O happens until `start()`. The internal copy path passes a complete spec. */
  constructor(imageOrSpec: string | ContainerSpec) {
    this.spec = typeof imageOrSpec === 'string' ? newContainerSpec(imageOrSpec, '') : imageOrSpec
  }

  /** Sets one environment variable visible to the workload (last-write-wins, insertion-ordered). */
  withEnv(key: string, value: string): GenericContainer {
    return new GenericContainer(withEnv(this.spec, key, value))
  }

  /** Publishes guest ports — host ports are pre-allocated by the launch (R7). */
  withExposedPorts(...ports: number[]): GenericContainer {
    return new GenericContainer(withExposedPorts(this.spec, ...ports))
  }

  /** Overrides the image's default ENTRYPOINT/CMD. */
  withCommand(...cmd: string[]): GenericContainer {
    return new GenericContainer(withCommand(this.spec, ...cmd))
  }

  /** Overrides the image's ENTRYPOINT. */
  withEntrypoint(...entrypoint: string[]): GenericContainer {
    return new GenericContainer(withEntrypoint(this.spec, ...entrypoint))
  }

  /** Sets the absolute guest working directory the workload starts in. */
  withWorkingDir(workingDir: string): GenericContainer {
    return new GenericContainer(withWorkingDir(this.spec, workingDir))
  }

  /** Copies a host file into the guest before boot — a read-write view, not a copy. */
  withCopyFileToContainer(hostPath: string, containerPath: string): GenericContainer {
    return new GenericContainer(withCopyFileToContainer(this.spec, hostPath, containerPath))
  }

  /** Copies a host directory into the guest before boot — same mount semantics as the file variant. */
  withCopyDirectoryToContainer(hostPath: string, containerPath: string): GenericContainer {
    return new GenericContainer(withCopyDirectoryToContainer(this.spec, hostPath, containerPath))
  }

  /** Joins a library-created network by id. */
  withNetwork(networkId: string): GenericContainer {
    return new GenericContainer(withNetwork(this.spec, networkId))
  }

  /** Names this container answers to on its network. */
  withNetworkAliases(...aliases: string[]): GenericContainer {
    return new GenericContainer(withNetworkAliases(this.spec, ...aliases))
  }

  /** Marks the container for reuse — double opt-in with `RIGHTSIZE_REUSE` (U10 adopts). */
  withReuse(): GenericContainer {
    return new GenericContainer(withReuse(this.spec))
  }

  /** Marks a container as meant to outlive this process — exempt from scope teardown. */
  withKeepAlive(keepAlive = true): GenericContainer {
    return new GenericContainer(withKeepAlive(this.spec, keepAlive))
  }

  /** Raises the container's memory ceiling in MB. */
  withMemoryLimit(megabytes: number): GenericContainer {
    return new GenericContainer(withMemoryLimit(this.spec, megabytes))
  }

  /** Sets the readiness deadline in ms; unset means the interpreter default (120s). */
  withStartupTimeout(ms: number): GenericContainer {
    return new GenericContainer(withStartupTimeout(this.spec, ms))
  }

  /** Sets the readiness strategy the launch waits on (default: every exposed port probes ready). */
  waitingFor(strategy: WaitStrategy): GenericContainer {
    return new GenericContainer(withWaitStrategy(this.spec, strategy))
  }

  /** Testcontainers-parity alias of `waitingFor`. */
  withWaitStrategy(strategy: WaitStrategy): GenericContainer {
    return this.waitingFor(strategy)
  }

  /** Demands hardware-virtualized isolation — the launch rejects the docker fallback pre-I/O. */
  withRequireIsolation(): GenericContainer {
    return new GenericContainer(withRequireIsolation(this.spec))
  }

  /** Caps the writable root disk in MB (msb-only; mutually exclusive with `withTmpfsRoot`). */
  withDiskLimit(megabytes: number): GenericContainer {
    return new GenericContainer(withDiskLimit(this.spec, megabytes))
  }

  /** Backs the writable root with RAM capped at `megabytes` (msb-only). */
  withTmpfsRoot(megabytes: number): GenericContainer {
    return new GenericContainer(withTmpfsRoot(this.spec, megabytes))
  }

  /** Blocks the guest's public-internet access (msb); cannot combine with `withNetwork`. */
  withNetworkDisabled(): GenericContainer {
    return new GenericContainer(withNetworkDisabled(this.spec))
  }

  /** Launches through the launch cell — validated pre-I/O, torn down at scope close unless `stop()`/`remove()` ran first. */
  start(options: LaunchOptions = {}) {
    return Effect.map(launchContainer(this.spec, options), (run) => toRunningContainer(run))
  }
}

/** Convenience: `fromImage('redis:8.6-alpine').withEnv('KEY', 'value')...` */
export const fromImage = (image: string): GenericContainer => new GenericContainer(image)

/** Wraps the executor's `RunningHandle` into the running-container surface. */
export const toRunningContainer = (run: RunningHandle): RunningContainer => {
  const handle = run.handle
  const spec = run.spec
  const stop = run.stop
  const remove = run.remove
  return {
    handle,
    backend: run.backend,
    spec,
    host: '127.0.0.1',
    getMappedPort: (guestPort) => {
      const binding = spec.ports.find((candidate) => candidate.guestPort === guestPort)
      return binding === undefined ? undefined : binding.hostPort
    },
    getHost: () => '127.0.0.1',
    exec: (request) =>
      Effect.gen(function*() {
        const runtime = yield* SandboxRuntime
        return yield* runtime.exec(handle, request)
      }),
    execCommand: (...command) =>
      Effect.gen(function*() {
        const runtime = yield* SandboxRuntime
        return yield* runtime.exec(handle, { command, env: [] })
      }),
    logs: Effect.gen(function*() {
      const runtime = yield* SandboxRuntime
      return yield* runtime.logs(handle)
    }),
    followOutput: (consumer) =>
      Effect.gen(function*() {
        const runtime = yield* SandboxRuntime
        return yield* runtime.followLogs(handle, consumer)
      }),
    copyFileToContainer: (hostPath, containerPath) =>
      Effect.gen(function*() {
        if (!path.posix.isAbsolute(containerPath)) {
          return yield* RelativeContainerPathError.make({ containerPath })
        }
        const parent = path.posix.dirname(containerPath)
        const runtime = yield* SandboxRuntime
        const mkdir = yield* runtime.exec(handle, { command: ['mkdir', '-p', parent], env: [] })
        if (mkdir.exitCode !== 0) {
          return yield* BackendError.make({
            message:
              `could not create parent directory '${parent}' in '${handle.spec.name}' before copying in: ${mkdir.stderr.trim()}`,
          })
        }
        yield* runtime.copyToContainer(handle, hostPath, containerPath)
        return undefined
      }),
    copyFileFromContainer: (containerPath, hostPath) =>
      Effect.gen(function*() {
        if (!path.posix.isAbsolute(containerPath)) {
          return yield* RelativeContainerPathError.make({ containerPath })
        }
        yield* Effect.tryPromise(() => fsp.mkdir(path.dirname(hostPath), { recursive: true })).pipe(
          Effect.catchEager(() => BackendError.make({ message: `could not create host parent of '${hostPath}'` })),
        )
        const runtime = yield* SandboxRuntime
        yield* runtime.copyFromContainer(handle, containerPath, hostPath)
        return undefined
      }),
    stop,
    remove,
  }
}

// Re-exported type members the public signatures reference; the executor's
// sealed internals stay out of the public barrel.
export type { AdoptRunningSeam, LaunchCellError, LaunchOptions, RunningHandle }
export type { BackendName, FollowHandle, SandboxHandle }
export type { RightsizeConfig, SandboxRuntime, Scope, Selection, VirtualNetworks }
