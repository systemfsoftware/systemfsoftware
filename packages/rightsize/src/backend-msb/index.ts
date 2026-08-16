/**
 * `layerMsb` — the microsandbox backend module. The layer is the only place
 * that reads impure configuration and touches the real filesystem/
 * child-process edges; the adapters it composes are pure-of-callsite
 * functions of their injected runner.
 *
 * Composition: the provisioner resolves (and if needed downloads) the pinned
 * msb binary from `RightsizeConfig` (`MSB_PATH` / `RIGHTSIZE_CACHE_DIR` /
 * `RIGHTSIZE_MSB_SKIP_DOWNLOAD`), the command runner is built over that
 * path, and one shared adapter state backs all four capability services.
 * The layer's release stops and removes every own-run sandbox (keepAlive
 * sandboxes survive by construction — they never enter the cleanup set).
 */
import { Effect, Layer } from 'effect'

import { ProvisionError } from '../model/errors.js'
import { RightsizeConfig } from '../runtime/config.js'
import {
  CheckpointStore,
  type CheckpointStoreService,
  ImageRegistry,
  type ImageRegistryService,
  SandboxRuntime,
  type SandboxRuntimeService,
  VirtualNetworks,
  type VirtualNetworksService,
} from '../runtime/runtime.js'
import { createMsbCheckpoints } from './checkpoint.adapter.js'
import { type CommandRunnerService, createCommandRunner } from './command-runner.js'
import { createMsbImages } from './images.adapter.js'
import { createMsbNetworks } from './networks.tunnel.js'
import { type ProvisionerOptions, provisionMsb } from './provisioner.adapter.js'
import {
  createMsbBackendState,
  createMsbRuntime,
  defaultMsbRuntimeOptions,
  type MsbRuntimeOptions,
} from './runtime.adapter.js'

/** The four services one msb backend instance provides. */
export interface MsbBackendServices {
  readonly SandboxRuntime: SandboxRuntimeService
  readonly VirtualNetworks: VirtualNetworksService
  readonly CheckpointStore: CheckpointStoreService
  readonly ImageRegistry: ImageRegistryService
}

/** The composed backend value — the services plus the layer-release close. */
export interface MsbBackendInstance {
  readonly open: MsbBackendServices
  readonly close: Effect.Effect<void>
}

/** Builds every service over one runner + shared state; the boot/tunnel timings are injectable for tests. */
export function createMsbBackend(
  runner: CommandRunnerService,
  runtimeOptions: MsbRuntimeOptions,
): MsbBackendInstance {
  const state = createMsbBackendState()
  const runtimeAdapter = createMsbRuntime(runner, state, runtimeOptions)
  const networks = createMsbNetworks(runner, runtimeAdapter.service, state)
  const checkpoints = createMsbCheckpoints(runner, runtimeAdapter.service)
  const images = createMsbImages(runner)
  return {
    open: {
      SandboxRuntime: runtimeAdapter.service,
      VirtualNetworks: networks,
      CheckpointStore: checkpoints,
      ImageRegistry: images,
    },
    close: runtimeAdapter.close,
  }
}

/**
 * The full microsandbox backend layer: provision the pinned msb binary,
 * build the command runner, and compose the four service adapters over one
 * shared state. Requires `RightsizeConfig`; provisioning failures fly as
 * `ProvisionError`, everything else as `BackendError`. The layer finalizer
 * runs the backend close (own-run sandboxes are stopped + removed).
 *
 * `Layer.unwrap` over per-tag `Layer.effect`s (the `layerDocker` shape, not
 * `Layer.effectContext`): one acquireRelease still owns the whole backend —
 * `unwrap` builds the effect in the layer's own scope, so the release runs
 * exactly when the layer is released — while the declared output keeps the
 * bare tag spelling every consumer's `Exclude` subtracts.
 */
export function layerMsb(
  options: { readonly provisioner?: ProvisionerOptions | undefined; readonly runtime?: MsbRuntimeOptions | undefined } =
    {},
): Layer.Layer<
  SandboxRuntime | VirtualNetworks | CheckpointStore | ImageRegistry,
  ProvisionError,
  RightsizeConfig
> {
  return Layer.unwrap(
    Effect.gen(function*() {
      const provisioned = yield* provisionMsb(options.provisioner)
      const runner = createCommandRunner(provisioned.msbPath)
      const backend = yield* Effect.acquireRelease(
        Effect.sync(() => createMsbBackend(runner, options.runtime ?? defaultMsbRuntimeOptions())),
        (opened) => opened.close,
      )
      return Layer.mergeAll(
        Layer.succeed(SandboxRuntime, backend.open.SandboxRuntime),
        Layer.succeed(VirtualNetworks, backend.open.VirtualNetworks),
        Layer.succeed(CheckpointStore, backend.open.CheckpointStore),
        Layer.succeed(ImageRegistry, backend.open.ImageRegistry),
      )
    }),
  )
}
