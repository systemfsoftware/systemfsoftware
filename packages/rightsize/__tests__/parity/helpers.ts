/**
 * The docker parity lane's shared harness: the deterministic docker layer
 * composition, the scoped launch runner, and the lane config value.
 *
 * The lane runs REAL containers — that is the point of this lane. The layer
 * below is `layerDocker` — the same composition CI exercises — over a
 * `Selection` produced by `layerAuto` from a docker-PINNED `RightsizeConfig`
 * (backend: 'docker', never 'auto'), so no environment can silently re-route
 * the oracle onto msb, not even a KVM-capable runner (RS-LANE: the layer pin
 * makes backend choice deterministic). When no socket answers the discovery
 * probe the layer fails with the library's `BackendUnreachableError` naming
 * every probed candidate — the lane never skips.
 *
 * Hygiene is `reaper: 'off'`: the parity lane measures the backend, not the
 * ledger; the ledger/watchdog machinery is unit-covered elsewhere (U4).
 * `cacheDir` still resolves so teardown release paths that read it work.
 */
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect, Layer, Result } from 'effect'
import type * as Scope from 'effect/Scope'

import { layerDocker } from '../../src/backend-docker/index.js'
import { BackendError } from '../../src/model/errors.js'
import type { RightsizeConfigService } from '../../src/runtime/config.js'
import { RightsizeConfig } from '../../src/runtime/config.js'
import {
  layerRuntimeDiscovery,
  type RuntimeDiscovery,
  UnsupportedDockerHostError,
} from '../../src/runtime/discovery/discovery.adapter.js'
import { CheckpointStore, ImageRegistry, SandboxRuntime, VirtualNetworks } from '../../src/runtime/runtime.js'
import { BackendUnreachableError, layerAuto, Selection } from '../../src/runtime/selection.workflow.js'

/** The services the lane layer provides — the launch cell's read environment plus the backend tags. */
export type LaneServices =
  | Selection
  | RightsizeConfig
  | SandboxRuntime
  | VirtualNetworks
  | CheckpointStore
  | ImageRegistry
  | RuntimeDiscovery

/** The lane layer's failure channel — all of them the library's own typed errors. */
export type LaneLayerError = BackendError | BackendUnreachableError | UnsupportedDockerHostError

/** A per-process temp dir; hygiene is off, but the launches resolve a cache dir regardless. */
export const laneCacheDir = (): string => path.join(os.tmpdir(), `rightsize-parity-${process.pid}`)

/** The docker-pinned config: `backend: 'docker'` (never auto), reaper off, no reuse opt-in. */
export const laneConfig = (): RightsizeConfigService => ({
  backend: 'docker',
  reaper: 'off',
  cacheDir: laneCacheDir(),
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

/**
 * The lane layer, built once at module scope: the auto selection
 * (docker-pinned) feeds `layerDocker`, and the whole backend board is
 * provided with the lane config + live discovery. Backend selection
 * happens exactly once here. A bare const, not a zero-arg factory — a
 * Layer is already lazy, and the effect compiler plugin rejects the
 * wrapper as needless indirection.
 */
export const laneLayer: Layer.Layer<LaneServices, LaneLayerError> = layerDocker.pipe(
  // provideMerge, not provide: the `Selection` the auto layer resolves must
  // STAY in the outer context — the launch cell reads it directly.
  Layer.provideMerge(layerAuto({ msbSupported: false })),
  Layer.provideMerge(Layer.mergeAll(Layer.succeed(RightsizeConfig, laneConfig()), layerRuntimeDiscovery)),
)

/**
 * A step's observable outcome: `ok` plus the failure's tag/message when it
 * failed — the gherkin pipeline's error channel is reserved for StepError,
 * so every fallible lane step captures failures as data (the launch
 * executor tests' `outcomeOf` idiom, extended with the failure message).
 */
export interface LaneOutcome<A> {
  readonly ok: boolean
  readonly value: A | undefined
  readonly failureTag: string | undefined
  readonly failureMessage: string | undefined
}

const tagOf = (failure: unknown): string | undefined =>
  typeof failure === 'object' && failure !== null && '_tag' in failure && typeof failure._tag === 'string'
    ? failure._tag
    : undefined

const messageOf = (failure: unknown): string | undefined => {
  if (typeof failure === 'object' && failure !== null && 'message' in failure && typeof failure.message === 'string') {
    return failure.message
  }
  return undefined
}

/** A data-failure outcome (for steps that must continue after a prior step failed). */
export const outcomeFailure = <A>(failureTag: string, failureMessage: string | undefined): LaneOutcome<A> => ({
  ok: false,
  value: undefined,
  failureTag,
  failureMessage,
})

/**
 * Runs a fallible effect under the lane layer and captures the outcome as
 * data. The layer's failure channel is converted to defects (`Layer.orDie`):
 * the global setup already failed the run with the named
 * `BackendUnreachableError` when no runtime answers, so a layer failure here
 * only occurs mid-run — which must fail the test, and a defect does exactly
 * that while keeping the step's error channel at `never`.
 */
export const laneOutcome = <A, E>(
  effect: Effect.Effect<A, E, LaneServices | Scope.Scope>,
): Effect.Effect<LaneOutcome<A>, never, Scope.Scope> =>
  Effect.map(
    Effect.result(effect.pipe(Effect.provide(laneLayer.pipe(Layer.orDie)))),
    (result): LaneOutcome<A> =>
      Result.isSuccess(result)
        ? { ok: true, value: result.success, failureTag: undefined, failureMessage: undefined }
        : { ok: false, value: undefined, failureTag: tagOf(result.failure), failureMessage: messageOf(result.failure) },
  )

/**
 * Runs a launch-scoped effect under the lane layer: the fresh scope's
 * finalizer tears the container down when the effect completes (or fails),
 * which is exactly the lifecycle surface the parity cases assert against.
 */
export const runScoped = <A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | LaneServices>,
): Promise<A> => Effect.runPromise(Effect.scoped(Effect.provide(effect, laneLayer)))
