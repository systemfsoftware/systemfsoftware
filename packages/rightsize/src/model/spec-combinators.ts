/**
 * Pure spec combinators — every `with*` is `(spec, …) => spec`: an immutable,
 * copy-on-write update that returns a new `ContainerSpec` and never touches
 * its input. Construction performs no I/O and validation travels on the
 * codec channel, so a combinator never throws (R2, KTD3, KTD6). The fluent
 * chained surface (testcontainers-style) is a thin wrapper over these
 * functions, wired in the fluent-surface unit.
 *
 * `env` semantics match upstream's builder exactly: insertion-ordered pairs,
 * last-write-wins — re-setting a key drops its prior entry and pushes the new
 * one, preserving the position of first-set untouched keys.
 */
import type { ContainerSpec, EnvPair } from './container-spec.js'
import type { FileMount } from './container-spec.js'
import type { PortBinding } from './ports.js'
import type { WaitStrategy } from './wait.js'

/**
 * A fresh spec: image and name required, every other field at its unset
 * default (`env` empty, ports unallocated, no command override, the default
 * `ForPort` readiness policy, no isolation demand). The launch workflow
 * fills `runId`, allocates host ports and derives the final container name.
 */
export const newContainerSpec = (image: string, name: string): ContainerSpec => ({
  name,
  image,
  env: [],
  ports: [],
  mounts: [],
  aliases: [],
  runId: '',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})

/**
 * Sets one environment variable. Last-write-wins on the key; insertion order
 * otherwise preserved.
 */
export const withEnv = (spec: ContainerSpec, key: string, value: string): ContainerSpec =>
  withEnvPairs(spec, [[key, value]])

/** Appends environment pairs with the same last-write-wins, insertion-ordered semantics as `withEnv`. */
export const withEnvPairs = (spec: ContainerSpec, pairs: ReadonlyArray<readonly [string, string]>): ContainerSpec => {
  let env: ReadonlyArray<EnvPair> = spec.env
  for (const [key, value] of pairs) {
    env = [...env.filter(([k]) => k !== key), [key, value]]
  }
  return { ...spec, env }
}

/**
 * Overrides the image's default ENTRYPOINT/CMD. No arguments (or an empty
 * call) leaves `command` unset, meaning the image runs unmodified.
 */
export const withCommand = (spec: ContainerSpec, ...command: string[]): ContainerSpec => ({
  ...spec,
  ...(command.length === 0 ? {} : { command }),
})

/**
 * Overrides the image's ENTRYPOINT. No arguments leaves `entrypoint` unset.
 */
export const withEntrypoint = (spec: ContainerSpec, ...entrypoint: string[]): ContainerSpec => ({
  ...spec,
  ...(entrypoint.length === 0 ? {} : { entrypoint }),
})

/**
 * Sets the absolute guest working directory the workload starts in.
 */
export const withWorkingDir = (spec: ContainerSpec, workingDir: string): ContainerSpec => ({
  ...spec,
  workingDir,
})

/**
 * Publishes guest ports; each is recorded as an unallocated binding
 * (`hostPort: 0`) — the launch workflow's pre-allocator replaces the marker
 * with a real host port before any backend call (R7).
 */
export const withExposedPorts = (spec: ContainerSpec, ...guestPorts: number[]): ContainerSpec => ({
  ...spec,
  ports: [...spec.ports, ...guestPorts.map((guestPort): PortBinding => ({ hostPort: 0, guestPort }))],
})

const appendMount = (spec: ContainerSpec, hostPath: string, guestPath: string): ContainerSpec => ({
  ...spec,
  mounts: [...spec.mounts, { hostPath, guestPath, readOnly: false } satisfies FileMount],
})

/**
 * Copies a host file into the guest before boot — a read-write view of the
 * host path, not a copy (upstream `withCopyFileToContainer`).
 */
export const withCopyFileToContainer = (spec: ContainerSpec, hostPath: string, guestPath: string): ContainerSpec =>
  appendMount(spec, hostPath, guestPath)

/**
 * Copies a host directory into the guest before boot — same mount semantics
 * as the file variant (upstream's copy CLI treats both identically;
 * testcontainers parity name).
 */
export const withCopyDirectoryToContainer = (spec: ContainerSpec, hostPath: string, guestPath: string): ContainerSpec =>
  appendMount(spec, hostPath, guestPath)

/**
 * Joins a library-created network by id, making this container reachable
 * from (and to) its running siblings by alias.
 */
export const withNetwork = (spec: ContainerSpec, networkId: string): ContainerSpec => ({ ...spec, networkId })

/**
 * Names this container answers to on its network.
 */
export const withNetworkAliases = (spec: ContainerSpec, ...aliases: string[]): ContainerSpec => ({
  ...spec,
  aliases: [...spec.aliases, ...aliases],
})

/**
 * Marks the container as reusable — the double opt-in (`RIGHTSIZE_REUSE`)
 * and the reuse identity-hash adoption live in the launch workflow; here it
 * sets the `keepAlive` flag a reusable container must carry so no
 * own-run cleanup path ever reaches it.
 */
export const withReuse = (spec: ContainerSpec): ContainerSpec => withKeepAlive(spec, true)

/**
 * Marks a container as meant to outlive this process — exempt from scope
 * teardown and the reaping ledger.
 */
export const withKeepAlive = (spec: ContainerSpec, keepAlive = true): ContainerSpec => ({ ...spec, keepAlive })

/** Raises the container's memory ceiling (in MB) above the backend default. */
export const withMemoryLimit = (spec: ContainerSpec, megabytes: number): ContainerSpec => ({
  ...spec,
  memoryLimitMb: megabytes,
})

/** Sets the readiness deadline in milliseconds; unset means the interpreter default (120s). */
export const withStartupTimeout = (spec: ContainerSpec, ms: number): ContainerSpec => ({
  ...spec,
  startupTimeoutMs: ms,
})

/**
 * Sets the readiness strategy `waitStrategy` interprets before the container
 * is ready. Defaults to `ForPort` when never called.
 */
export const waitingFor = (spec: ContainerSpec, strategy: WaitStrategy): ContainerSpec => ({
  ...spec,
  waitStrategy: strategy,
})

/** Testcontainers-parity alias for `waitingFor` (R3). */
export const withWaitStrategy = waitingFor

/** Demands hardware-virtualized isolation: the launch workflow rejects the docker fallback with `IsolationRequiredError`. */
export const withRequireIsolation = (spec: ContainerSpec): ContainerSpec => ({ ...spec, requireIsolation: true })

/** Sets a writable-root-disk ceiling in MB (msb-only). */
export const withDiskLimit = (spec: ContainerSpec, megabytes: number): ContainerSpec => ({
  ...spec,
  diskLimitMb: megabytes,
})

/** Sets a RAM-backed writable root capped at `megabytes` (msb-only). */
export const withTmpfsRoot = (spec: ContainerSpec, megabytes: number): ContainerSpec => ({
  ...spec,
  tmpfsRootMb: megabytes,
})

/** Blocks the guest's public-internet access (msb); cannot be combined with `withNetwork` (workflow-validated). */
export const withNetworkDisabled = (spec: ContainerSpec): ContainerSpec => ({ ...spec, networkDisabled: true })
