/**
 * Recording doubles for the runtime Tags (R18) — the seam the integration
 * suites script against: every backend call is RECORDED, never executed, so
 * launch/teardown ordering, the retry budget, and the zero-backend-call
 * validation contract are asserted on recorded facts instead of sockets.
 */
import { Effect, Layer } from 'effect'

import type { RuntimeCapabilities } from '../src/model/capabilities.schema.js'
import type { ContainerSpec } from '../src/model/container-spec.schema.js'
import type { BackendError, PortBindConflictError } from '../src/model/errors.js'
import { RightsizeConfig } from '../src/runtime/config.js'
import type { RightsizeConfigService } from '../src/runtime/config.js'
import type { SandboxHandle, SandboxRuntimeService, VirtualNetworksService } from '../src/runtime/runtime.js'
import { Selection } from '../src/runtime/selection.workflow.js'

/** The docker capability board the doubles carry (shared kernel, native networks, health inspection). */
export const DOCKER_CAPABILITIES: RuntimeCapabilities = {
  hardwareIsolated: false,
  checkpoint: true,
  checkpointRestartsWorkload: false,
  supportsNativeNetworks: true,
  healthInspection: true,
}

/** Scripted overrides: each method falls back to the default recording behavior unless overridden. */
export interface RecordingScripts {
  readonly create?: (spec: ContainerSpec) => Effect.Effect<SandboxHandle, BackendError>
  readonly start?: (handle: SandboxHandle) => Effect.Effect<void, BackendError | PortBindConflictError>
  readonly stop?: (handle: SandboxHandle) => Effect.Effect<void, BackendError>
  readonly remove?: (handle: SandboxHandle) => Effect.Effect<void, BackendError>
}

/** The recording surface: the service plus its call log. */
export interface RecordingRuntime {
  readonly service: SandboxRuntimeService
  readonly calls: string[]
}

let handleSequence = 0

/** A `SandboxRuntimeService` recording double — every method records a `name:arg` line, then runs the scripted behavior (defaults succeed). */
export const makeRecordingRuntime = (scripts: RecordingScripts = {}): RecordingRuntime => {
  const calls: string[] = []
  const containerSeq = (): number => ++handleSequence
  const service: SandboxRuntimeService = {
    name: 'docker',
    capabilities: DOCKER_CAPABILITIES,
    create: (spec) => {
      calls.push(`create:${spec.name}`)
      if (scripts.create !== undefined) {
        return scripts.create(spec)
      }
      return Effect.succeed({ id: `cid-${containerSeq()}`, spec })
    },
    start: (handle) => {
      calls.push(`start:${handle.id}`)
      return scripts.start !== undefined ? scripts.start(handle) : Effect.void
    },
    stop: (handle) => {
      calls.push(`stop:${handle.id}`)
      return scripts.stop !== undefined ? scripts.stop(handle) : Effect.void
    },
    remove: (handle) => {
      calls.push(`remove:${handle.id}`)
      return scripts.remove !== undefined ? scripts.remove(handle) : Effect.void
    },
    exec: (handle, _request) => {
      calls.push(`exec:${handle.id}`)
      return Effect.succeed({ exitCode: 0, stdout: '', stderr: '' })
    },
    logs: (handle) => {
      calls.push(`logs:${handle.id}`)
      return Effect.succeed('')
    },
    followLogs: (handle) => {
      calls.push(`followLogs:${handle.id}`)
      return Effect.succeed({ close: Effect.void })
    },
    copyToContainer: () => Effect.void,
    copyFromContainer: () => Effect.void,
    inspect: (handle) => {
      calls.push(`inspect:${handle.id}`)
      return Effect.succeed({ exists: true, running: true, health: undefined })
    },
    removeByName: (name) => {
      calls.push(`removeByName:${name}`)
      return Effect.void
    },
    findRunning: () => {
      // `succeed` over a typed `undefined` binding, not the `undefined`
      // literal: the findRunning channel is `SandboxHandle | undefined`, and
      // the effect plugin prescribes `Effect.void` only for void outcomes.
      const none: SandboxHandle | undefined = undefined
      return Effect.succeed(none)
    },
  }
  return { service, calls }
}

/** The recording `VirtualNetworks` twin. */
export interface RecordingNetworks {
  readonly service: VirtualNetworksService
  readonly calls: string[]
}

export const makeRecordingNetworks = (): RecordingNetworks => {
  const calls: string[] = []
  return {
    service: {
      ensureNetwork: (id) => {
        calls.push(`ensureNetwork:${id}`)
        return Effect.void
      },
      removeNetwork: (id) => {
        calls.push(`removeNetwork:${id}`)
        return Effect.void
      },
      installNetworkLinks: (handle, links) => {
        calls.push(`installNetworkLinks:${handle.id}:${links.length}`)
        return Effect.void
      },
    },
    calls,
  }
}

/** The docker-backed test environment values the launch cell reads. */
export const dockerSelection = (): { readonly backend: 'docker'; readonly dockerSocketPath: string } => ({
  backend: 'docker',
  dockerSocketPath: '/tmp/test-docker.sock',
})

/** A `RightsizeConfig` service value for tests — `reaper` defaults to `off` so test launches never write real ledger files or spawn watchdogs. */
export const testConfig = (
  cacheDir: string,
  reaper: 'on' | 'sweep' | 'off' = 'off',
): RightsizeConfigService => ({
  backend: 'auto',
  reaper,
  cacheDir,
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: false,
})

/** The layer providing the docker selection + the config — the launch cell's read environment minus the runtime Tags. */
export const testEnvironmentLayer = (
  cacheDir: string,
  reaper: 'on' | 'sweep' | 'off' = 'off',
): Layer.Layer<Selection | RightsizeConfig> =>
  Layer.mergeAll(
    Layer.succeed(Selection, makeSelection(dockerSelection().dockerSocketPath)),
    Layer.succeed(RightsizeConfig, testConfig(cacheDir, reaper)),
  )

const makeSelection = (socketPath: string): { readonly backend: 'docker'; readonly dockerSocketPath: string } => ({
  backend: 'docker',
  dockerSocketPath: socketPath,
})
