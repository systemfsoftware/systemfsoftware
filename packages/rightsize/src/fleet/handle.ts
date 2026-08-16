/**
 * The agent-native by-id handle (R15, KTD7) — the durable, JSON-threadable
 * identity of one launched container, and the reconstruction surface that
 * makes it executable from any same-host process without a fresh launch.
 *
 * A `ContainerHandle` carries everything a foreign process needs to rebuild
 * exec/logs/probe capabilities from data alone:
 *
 * - the backend name and the backend-native container id (the msb agent
 *   endpoint when applicable);
 * - the allocated port bindings captured at launch (the port map a worker
 *   needs to reach the workload — recorded at create, never re-derived
 *   from a backend query);
 * - a `fingerprint` over (backend, containerId), recorded in the on-disk
 *   hygiene ledger at create (the ledger's per-sandbox `id` field — the
 *   ledger comment names it "the U8 by-id fingerprint"). `byId` validates
 *   the fingerprint on reconstruction, so a tampered or repurposed handle
 *   fails with a typed error before any backend contact — never silent exec.
 *
 * `ContainerHandle.byId(handleJson)`:
 * - decodes the JSON (`MalformedHandleError`);
 * - validates the fingerprint (`HandleBackendMismatchError` on mismatch);
 * - reconstructs the backend surface WITHOUT a launch: the docker path
 *   composes exactly what `layerDocker` composes (the unix-socket client
 *   over the resolved `Selection`'s socket path, then the runtime adapter),
 *   and the msb path probes the recorded agent endpoint (unreachable →
 *   `UnreachableMsbAgentError` carrying the endpoint) and drives the msb
 *   CLI keyed by the sandbox name (msb exec/logs are agent-routed — the
 *   launching process's attached children are irrelevant cross-process).
 *
 * Same-host assumption (documented, R15): the reconstruction is only
 * meaningful on the host that reached the backend — docker dials a unix
 * socket, msb's agent endpoint and `msb <name>` invocations are local to
 * the machine that launched the sandbox. Both migrated lanes run
 * same-host by construction.
 */
import { createHash } from 'node:crypto'
import { accessSync, constants as fsConstants } from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'

import { Effect, Result, Schema as S } from 'effect'

import { makeDockerClient } from '../backend-docker/client.js'
import type { DockerClient } from '../backend-docker/client.js'
import { makeDockerNetworks } from '../backend-docker/networks.js'
import { makeDockerRuntime } from '../backend-docker/runtime.js'
import { createCommandRunner } from '../backend-msb/command-runner.js'
import type { CommandRunnerService } from '../backend-msb/command-runner.js'
import { msbInstallPaths, platformFor } from '../backend-msb/platform.js'
import { resolveCacheDir } from '../backend-msb/provisioner/env.js'
import {
  copyInto,
  copyOutOf,
  createMsbBackendState,
  defaultMsbRuntimeOptions,
  execIn,
  followLogsOf,
  inspectIn,
  logsOf,
  removeIn,
  stopSandbox,
} from '../backend-msb/runtime.js'
import type { ContainerSpec, ExecRequest, ExecResult } from '../model/container-spec.js'
import { BackendError } from '../model/errors.js'
import { PortBinding } from '../model/ports.js'
import { newContainerSpec } from '../model/spec-combinators.js'
import { RightsizeConfig } from '../runtime/config.js'
import type { RightsizeConfigService } from '../runtime/config.js'
import type { BackendName, ContainerInspect, FollowHandle, SandboxHandle } from '../runtime/runtime.js'
import { Selection } from '../runtime/selection.workflow.js'
import type { SelectionService } from '../runtime/selection.workflow.js'
import { recordContainer, unregisterContainer } from './registry.js'

// =============================================================================
// Typed handle errors — the fleet's additions to the taxonomy (U12's merge)
// =============================================================================

/** The handle JSON did not decode as a `ContainerHandle`. */
export class MalformedHandleError extends S.TaggedError<MalformedHandleError>()('MalformedHandleError', {
  message: S.String,
}) {}

/**
 * Reconstruction refused: the handle could not be validated or rebuilt —
 * either its fingerprint does not match its backend + id identity, or the
 * recorded backend cannot be reconstructed in this process. `actual` names
 * what the reconstruction found instead.
 */
export class HandleBackendMismatchError
  extends S.TaggedError<HandleBackendMismatchError>()('HandleBackendMismatchError', {
    backend: S.Literals(['docker', 'msb']),
    actual: S.String,
    containerId: S.String,
    reason: S.String,
  })
{}

/** An msb handle's recorded agent endpoint did not answer the reachability probe. */
export class UnreachableMsbAgentError extends S.TaggedError<UnreachableMsbAgentError>()('UnreachableMsbAgentError', {
  backend: S.Literals(['msb']),
  /** The recorded agent endpoint that could not be reached. */
  endpoint: S.String,
  message: S.String,
}) {}

/** Every failure a by-id reconstruction can surface. */
export type HandleByidError =
  | MalformedHandleError
  | HandleBackendMismatchError
  | UnreachableMsbAgentError
  | BackendError

// =============================================================================
// Fingerprint kernel — the reconstruction credential
// =============================================================================

/** The fingerprint scheme prefix — a scheme change is a mismatch, never a silent re-dial. */
export const FINGERPRINT_SCHEME = 'rzh1'

/** The pure fingerprint: scheme + 24 hex chars of SHA-256 over backend and id. Deterministic for the same (backend, id). */
export const computeHandleFingerprint = (backend: string, containerId: string): string =>
  `${FINGERPRINT_SCHEME}:${createHash('sha256').update(`${backend}\u0000${containerId}`).digest('hex').slice(0, 24)}`

/** Whether the handle carries the fingerprint its own identity implies. */
export const fingerprintMatches = (handle: ContainerHandle): boolean =>
  handle.fingerprint === computeHandleFingerprint(handle.backend, handle.containerId)

/**
 * The durable, JSON-threadable container identity: backend + backend-native
 * id (+ the msb agent endpoint where applicable), the launch-time port map,
 * and the fingerprint recorded at create.
 */
export class ContainerHandle extends S.Class<ContainerHandle>('ContainerHandle')({
  /** Handle format version — the reconstruction gate for future formats. */
  version: S.Literal(1),
  /** Which backend runs the container (`'docker'` | `'msb'`). */
  backend: S.Literals(['docker', 'msb']),
  /** The backend-native container id (the msb sandbox name, for msb). */
  containerId: S.String,
  /** The msb agent endpoint, when the container runs on msb and the endpoint was recorded at create. */
  msbAgentEndpoint: S.optionalKey(S.String),
  /** The host ports allocated to this container at launch, guest → host. */
  ports: S.Array(PortBinding),
  /** The fingerprint over backend + container id, validated by `byId` before any backend contact. */
  fingerprint: S.String,
}) {
  /**
   * Mints a handle for a launched container and registers the container in
   * the live fleet registry (the create-time record; the on-disk ledger's
   * sandbox id was already recorded by the launch executor itself). Ports
   * and image are captured verbatim from the launch result — never
   * re-derived from a backend query.
   */
  static fromRunning(
    run: { readonly backend: BackendName; readonly handle: SandboxHandle; readonly spec: ContainerSpec },
    options: { readonly msbAgentEndpoint?: string | undefined } = {},
  ): ContainerHandle {
    const fields = {
      version: 1 as const,
      backend: run.backend,
      containerId: run.handle.id,
      ports: [...run.spec.ports],
      fingerprint: computeHandleFingerprint(run.backend, run.handle.id),
    }
    const handle = options.msbAgentEndpoint === undefined
      ? ContainerHandle.make(fields)
      : ContainerHandle.make({ ...fields, msbAgentEndpoint: options.msbAgentEndpoint })
    recordContainer({
      backend: run.backend,
      id: run.handle.id,
      name: run.spec.name,
      image: run.spec.image,
      ports: [...run.spec.ports],
    })
    return handle
  }

  /** Serializes a handle to its durable JSON form — the form `byId` takes. */
  static toJson(handle: ContainerHandle): string {
    return JSON.stringify(S.encodeSync(ContainerHandle)(handle))
  }

  /** Parses + decodes a serialized handle — the typed failure is a decode failure, never a throw (KTD6). */
  static fromJson(handleJson: string): Result.Result<ContainerHandle, MalformedHandleError> {
    let parsed: unknown
    try {
      parsed = JSON.parse(handleJson)
    } catch {
      return Result.fail(MalformedHandleError.make({ message: 'container handle JSON did not parse — not valid JSON' }))
    }
    try {
      return Result.succeed(S.decodeUnknownSync(ContainerHandle)(parsed))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown decode error'
      return Result.fail(MalformedHandleError.make({ message: `container handle JSON did not decode: ${detail}` }))
    }
  }

  /**
   * Reconstructs exec/logs/probe capabilities from a serialized handle
   * alone, against the recorded backend — no fresh launch (R15). The docker
   * path composes the same client `layerDocker` composes (unix socket from
   * the ambient `Selection`); the msb path validates the recorded agent
   * endpoint and drives the msb CLI by name. See the module doc for the
   * same-host assumption.
   */
  static byId(
    handleJson: string,
    options: ByIdOptions = {},
  ): Effect.Effect<HandleOps, HandleByidError, Selection | RightsizeConfig> {
    return Effect.gen(function*() {
      const parsed = ContainerHandle.fromJson(handleJson)
      if (Result.isFailure(parsed)) {
        return yield* parsed.failure
      }
      const handle = parsed.success
      if (!fingerprintMatches(handle)) {
        return yield* HandleBackendMismatchError.make({
          backend: handle.backend,
          actual: 'fingerprint-mismatch',
          containerId: handle.containerId,
          reason:
            'the handle fingerprint does not match its backend + id identity (a tampered, truncated, or fabricated handle)',
        })
      }
      if (handle.backend === 'docker') {
        const selection = yield* Selection
        return yield* reconstructDocker(handle, selection)
      }
      const config = yield* RightsizeConfig
      return yield* reconstructMsb(handle, config, options)
    })
  }
}

/** The reconstructed surface `byId` returns. */
export interface HandleOps {
  /** The handle data this surface was reconstructed from. */
  readonly handle: ContainerHandle
  /** Which backend the ops run against. */
  readonly backend: BackendName
  /** The backend-native container id. */
  readonly containerId: string
  /** The host port bound to `guestPort`, or `undefined` when the port was never exposed/recorded. */
  getMappedPort(guestPort: number): number | undefined
  /** Always `127.0.0.1` — every published port binds loopback-only (R9). */
  getHost(): string
  /** Runs a one-shot command inside the container — exit code is a verdict, never an exception. */
  exec(request: ExecRequest): Effect.Effect<ExecResult, BackendError>
  /** Variadic convenience over `exec`. */
  execCommand(...command: string[]): Effect.Effect<ExecResult, BackendError>
  /** The workload's logs so far (bounded tail), as one string. */
  readonly logs: Effect.Effect<string, BackendError>
  /** Streams log lines in order, no duplicates; the returned handle closes delivery without flushing. */
  followOutput(consumer: (line: string) => void): Effect.Effect<FollowHandle, BackendError>
  /** The container's existence/state/health on the recorded backend. */
  readonly inspect: Effect.Effect<ContainerInspect, BackendError>
  /** Stops the workload (best-effort backend stop; a stopped container may still exist). */
  readonly stop: Effect.Effect<void, BackendError>
  /** Removes the container (docker `rm -f`; msb `rm`), dropping it from the live registry. */
  readonly remove: Effect.Effect<void, BackendError>
  /** Copies a host file/directory into the guest, creating the destination's parent first. */
  copyToContainer(hostPath: string, containerPath: string): Effect.Effect<void, BackendError>
  /** The reverse direction. */
  copyFromContainer(containerPath: string, hostPath: string): Effect.Effect<void, BackendError>
}

/** The two backend names, as the handle schema spells them. */
export type Backend = 'docker' | 'msb'

/** Test seams for `byId` — every default is the real backend surface, scripted only under test. */
export interface ByIdOptions {
  readonly msb?: {
    /** An already-assembled CLI runner (default: derived from the resolved msb binary + cache layout). */
    readonly runner?: CommandRunnerService | undefined
    /** The agent-endpoint reachability probe (default: a real `net.connect` probe). */
    readonly probeEndpoint?: ((endpoint: string) => Effect.Effect<boolean>) | undefined
  } | undefined
}

/** The inert spec the reconstructed sandbox handle carries — no by-id op dereferences a spec (see the module doc). */
const SHELL_SPEC: ContainerSpec = { ...newContainerSpec('', ''), name: 'by-id' }

const shellSandbox = (id: string): SandboxHandle => ({ id, spec: SHELL_SPEC })

const unregisterLiveEffect = (backend: BackendName, id: string): Effect.Effect<void> =>
  Effect.sync(() => unregisterContainer(backend, id))

// =============================================================================
// The reconstruction — docker path
// =============================================================================

const toDockerOps = (handle: ContainerHandle, client: DockerClient): HandleOps => {
  // The same composition `layerDocker` uses: one client over the selection's
  // socket path plus the runtime adapter — nothing launches a container.
  const networks = makeDockerNetworks(client)
  const runtime = makeDockerRuntime(client, networks)
  const sandbox = shellSandbox(handle.containerId)
  return {
    handle,
    backend: 'docker',
    containerId: handle.containerId,
    getMappedPort: (guestPort) => {
      const binding = handle.ports.find((candidate) => candidate.guestPort === guestPort)
      return binding === undefined ? undefined : binding.hostPort
    },
    getHost: () => '127.0.0.1',
    exec: (request) => runtime.exec(sandbox, request),
    execCommand: (...command) => runtime.exec(sandbox, { command, env: [] }),
    logs: runtime.logs(sandbox),
    followOutput: (consumer) => runtime.followLogs(sandbox, consumer),
    inspect: runtime.inspect(sandbox),
    stop: runtime.stop(sandbox),
    remove: runtime.remove(sandbox).pipe(Effect.andThen(unregisterLiveEffect(handle.backend, handle.containerId))),
    copyToContainer: (hostPath, containerPath) => runtime.copyToContainer(sandbox, hostPath, containerPath),
    copyFromContainer: (containerPath, hostPath) => runtime.copyFromContainer(sandbox, containerPath, hostPath),
  }
}

const reconstructDocker = (
  handle: ContainerHandle,
  selection: SelectionService,
): Effect.Effect<HandleOps, HandleBackendMismatchError | BackendError> =>
  Effect.gen(function*() {
    if (selection.backend !== 'docker' || selection.dockerSocketPath === undefined) {
      return yield* HandleBackendMismatchError.make({
        backend: 'docker',
        actual: selection.backend,
        containerId: handle.containerId,
        reason: `this process's selection resolved '${selection.backend}'; a docker handle can only be reconstructed ` +
          'against a docker selection',
      })
    }
    return toDockerOps(handle, makeDockerClient(selection.dockerSocketPath))
  })

// =============================================================================
// The reconstruction — msb path (agent endpoint gate + CLI driver)
// =============================================================================

/** One connect-probe target parsed from an msb agent endpoint. */
export type EndpointTarget =
  | { readonly kind: 'tcp'; readonly host: string; readonly port: number }
  | { readonly kind: 'unix'; readonly sockPath: string }

/**
 * The pure endpoint grammar the reachability probe understands: a tcp
 * `host:port` (scheme optional), a unix socket path (bare or `unix://`). A
 * Windows named pipe (`\\\\.\\pipe\\…`) is returned as `undefined` — pipes
 * cannot be probed with `net.connect`, so that endpoint reads as
 * unreachable.
 */
export const parseAgentEndpoint = (endpoint: string): EndpointTarget | undefined => {
  const trimmed = endpoint.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  if (trimmed.startsWith('unix://')) {
    const sockPath = trimmed.slice('unix://'.length)
    return sockPath.length > 0 ? { kind: 'unix', sockPath } : undefined
  }
  if (trimmed.startsWith('/')) {
    return { kind: 'unix', sockPath: trimmed }
  }
  if (trimmed.startsWith('\\\\')) {
    return undefined
  }
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const colon = withoutScheme.lastIndexOf(':')
  if (colon === -1) {
    return undefined
  }
  const host = withoutScheme.slice(0, colon) === '' ? '127.0.0.1' : withoutScheme.slice(0, colon)
  const portText = withoutScheme.slice(colon + 1)
  if (!/^\d+$/.test(portText)) {
    return undefined
  }
  const port = Number.parseInt(portText, 10)
  if (port < 1 || port > 65535) {
    return undefined
  }
  return { kind: 'tcp', host, port }
}

/** Bounded by the same ceiling the discovery probe uses — a silent agent fails the probe, not the caller's patience. */
const ENDPOINT_PROBE_TIMEOUT_MS = 2_000

/**
 * The default agent-endpoint probe: `net.connect` with a bounded timeout.
 * Liveness is the `connect` event and only it; any other outcome — error,
 * timeout, or an endpoint shape `parseAgentEndpoint` cannot dial — scores
 * `false`, and the reconstruction follows with the typed unreachable error
 * carrying the endpoint.
 */
export const probeMsbAgentEndpoint = (endpoint: string): Effect.Effect<boolean> => {
  const target = parseAgentEndpoint(endpoint)
  if (target === undefined) {
    return Effect.succeed(false)
  }
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = target.kind === 'tcp'
    ? net.connect({ host: target.host, port: target.port })
    : net.connect(target.sockPath)
  let settled = false
  const finish = (live: boolean): void => {
    if (settled) {
      return
    }
    settled = true
    socket.destroy()
    resolve(live)
  }
  socket.once('connect', () => finish(true))
  socket.once('error', () => finish(false))
  socket.setTimeout(ENDPOINT_PROBE_TIMEOUT_MS, () => finish(false))
  return Effect.promise(() => promise)
}

const toMsbOps = (handle: ContainerHandle, runner: CommandRunnerService): HandleOps => {
  const state = createMsbBackendState()
  const options = defaultMsbRuntimeOptions()
  const containerId = handle.containerId
  const sandbox = shellSandbox(containerId)
  return {
    handle,
    backend: 'msb',
    containerId,
    getMappedPort: (guestPort) => {
      const binding = handle.ports.find((candidate) => candidate.guestPort === guestPort)
      return binding === undefined ? undefined : binding.hostPort
    },
    getHost: () => '127.0.0.1',
    exec: (request) => execIn(runner, containerId, request, options),
    execCommand: (...command) => execIn(runner, containerId, { command, env: [] }, options),
    logs: logsOf(runner, containerId, options),
    followOutput: (consumer) => followLogsOf(runner, containerId, consumer, options),
    inspect: inspectIn(runner, sandbox, options),
    stop: stopSandbox(runner, state, containerId, options),
    remove: removeIn(runner, state, containerId, options).pipe(
      Effect.andThen(unregisterLiveEffect(handle.backend, containerId)),
    ),
    copyToContainer: (hostPath, containerPath) => copyInto(runner, sandbox, hostPath, containerPath, options),
    copyFromContainer: (containerPath, hostPath) => copyOutOf(runner, sandbox, containerPath, hostPath, options),
  }
}

const reconstructMsb = (
  handle: ContainerHandle,
  config: RightsizeConfigService,
  options: ByIdOptions,
): Effect.Effect<HandleOps, UnreachableMsbAgentError | BackendError> =>
  Effect.gen(function*() {
    const endpoint = handle.msbAgentEndpoint
    if (endpoint !== undefined) {
      const probe = options.msb?.probeEndpoint ?? probeMsbAgentEndpoint
      const live = yield* probe(endpoint)
      if (!live) {
        return yield* UnreachableMsbAgentError.make({
          backend: 'msb',
          endpoint,
          message:
            `msb agent endpoint '${endpoint}' did not answer — the sandbox's agent is not reachable on this host`,
        })
      }
    }
    const seam = options.msb?.runner
    if (seam !== undefined) {
      return toMsbOps(handle, seam)
    }
    const binary = msbBinaryFor(config, cacheDirFromConfig(config))
    if (binary === undefined) {
      return yield* BackendError.make({
        message:
          `cannot reconstruct the msb exec surface for container '${handle.containerId}': no msb binary resolved ` +
          '(MSB_PATH unset or unusable, and no pinned install under the rightsize cache)',
      })
    }
    return toMsbOps(handle, createCommandRunner(binary))
  })

// =============================================================================
// Shared resolution helpers
// =============================================================================

/** The rightsize cache dir — the shared default the fleet and the by-id driver resolve (same shape as launch hygiene). */
export const cacheDirFromConfig = (config: RightsizeConfigService): string =>
  resolveCacheDir({
    rightsizeCacheDir: config.cacheDir,
    platform: process.platform,
    homedir: os.homedir(),
    localAppData: process.env['LOCALAPPDATA'],
  })

const isExecutable = (filePath: string): boolean => {
  try {
    accessSync(filePath, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

const isReadable = (filePath: string): boolean => {
  try {
    accessSync(filePath, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

/** MSB_PATH when executable, else the cache-pinned install (the krun half must be readable too — binary-last install). */
export const msbBinaryFor = (config: RightsizeConfigService, cacheDir: string): string | undefined => {
  if (config.msbPath !== undefined) {
    return isExecutable(config.msbPath) ? config.msbPath : undefined
  }
  const platform = platformFor(process.platform, process.arch)
  if (platform === undefined) {
    return undefined
  }
  const install = msbInstallPaths(cacheDir, platform)
  return isExecutable(install.msbPath) && isReadable(install.krunPath) ? install.msbPath : undefined
}
