/**
 * `layerDocker` — the docker backend's composition seam (R8, KTD4): the
 * unix-socket client resolved from the selection's `dockerSocketPath`, plus
 * the four backend Layers over it (`SandboxRuntime`, `VirtualNetworks`,
 * `CheckpointStore`, `ImageRegistry`).
 *
 * The layer consumes the `Selection` service — `layerAuto` (or an explicit
 * `layerDocker` provided alongside a `Selection`) is the caller's job — and
 * fails with a typed `BackendError` when composed under a selection that is
 * not docker: it never dials a socket it was not told to dial.
 *
 * `registerDockerCleanupSync` is re-exported here so the backend's public
 * subpath (`src/backend-docker.ts`) carries the blocking cleanup primitive
 * the hygiene unit's sync-exit registry consumes.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer } from 'effect'
import { BackendError } from '../model/errors.js'
import { CheckpointStore, ImageRegistry, SandboxRuntime, VirtualNetworks } from '../runtime/runtime.js'
import { Selection } from '../runtime/selection.workflow.js'
import { makeDockerCheckpoints } from './checkpoint.js'
import { makeDockerClient } from './client.js'
import type { DockerClient } from './client.js'
import { makeDockerImages } from './images.js'
import { makeDockerNetworks } from './networks.js'
import { makeDockerRuntime } from './runtime.js'

export { registerDockerCleanupSync } from './cli.js'
export type { DockerCleanupSync } from './cli.js'

/** The client as a context member the four adapter layers resolve against. */
export class DockerClientContext extends Context.Service<DockerClientContext, DockerClient>()(
  '@systemfsoftware/rightsize/backend-docker/DockerClientContext',
) {}

/** Constructs the client from the selection's docker socket path; a non-docker selection is a hard composition error. */
const layerClient: Layer.Layer<DockerClientContext, BackendError, Selection> = Layer.effect(
  DockerClientContext,
  Effect.gen(function*() {
    const selection = yield* Selection
    if (selection.backend !== 'docker' || selection.dockerSocketPath === undefined) {
      return yield* BackendError.make({
        message:
          'layerDocker was composed under a non-docker selection; provide a Selection whose backend is docker (layerAuto, or a manual docker selection)',
      })
    }
    return makeDockerClient(selection.dockerSocketPath)
  }),
)

// ONE networks instance feeds both the runtime (create consults it) and the
// public VirtualNetworks Tag — makeDockerRuntime's contract requires the
// same helper so the ensure/remove caches stay coherent.
const layerNetworks: Layer.Layer<VirtualNetworks, never, DockerClientContext> = Layer.effect(
  VirtualNetworks,
  Effect.gen(function*() {
    const client = yield* DockerClientContext
    return makeDockerNetworks(client)
  }),
)

const layerRuntime: Layer.Layer<SandboxRuntime, never, DockerClientContext | VirtualNetworks> = Layer.effect(
  SandboxRuntime,
  Effect.gen(function*() {
    const client = yield* DockerClientContext
    const networks = yield* VirtualNetworks
    return makeDockerRuntime(client, networks)
  }),
)

const layerCheckpoints: Layer.Layer<CheckpointStore, never, DockerClientContext> = Layer.effect(
  CheckpointStore,
  Effect.gen(function*() {
    const client = yield* DockerClientContext
    return makeDockerCheckpoints(client)
  }),
)

const layerImages: Layer.Layer<ImageRegistry, never, DockerClientContext> = Layer.effect(
  ImageRegistry,
  Effect.gen(function*() {
    const client = yield* DockerClientContext
    // No registry auth by default: `pull` authenticates only when the
    // caller configured credentials (the daemon usually has its own).
    return makeDockerImages(client)
  }),
)

/**
 * The docker backend — all four Tags over one unix-socket client. Requires
 * a `Selection` that chose docker; compose with `layerAuto` for the resolved
 * value.
 */
export const layerDocker: Layer.Layer<
  SandboxRuntime | VirtualNetworks | CheckpointStore | ImageRegistry,
  BackendError,
  Selection
> = Layer.mergeAll(
  layerRuntime.pipe(Layer.provideMerge(layerNetworks)),
  layerCheckpoints,
  layerImages,
).pipe(Layer.provide(layerClient))
