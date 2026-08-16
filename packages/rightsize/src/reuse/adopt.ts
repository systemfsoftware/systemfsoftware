/**
 * The reuse-adopt seam (R14) — the executor-facing half of reuse's
 * double-opt-in flow, authored as a `Cell` description (the repo's
 * sandwich: read → decode → decide → encode → write, applied through the
 * library's interpreter) and exposed as an `AdoptRunningSeam` the launch
 * executor's reuse branch consumes (`LaunchOptions.adoptRunning`).
 *
 * The public factory is an EFFECT (`adoptRunningSeam(options)`) that reads
 * the services (the double-opt-in config + the active runtime) and closes
 * the returned seam over them — the executor's `AdoptRunningSeam` contract
 * is a plain `(spec) => Effect` with no service requirements, so the seam
 * captures them at factory time and provides them to its own cell.
 *
 * Composition per invocation (inside the seam):
 *
 * - `read` gathers the recorded facts a decision needs and performs the
 *   adopt path's lookups: the double-opt-in verdict (`withReuse` marker on
 *   the spec AND `RIGHTSIZE_REUSE` via `RightsizeConfig`), the content
 *   hash over the reuse-relevant spec slice + the deterministic
 *   `rz-reuse-<hash12>` name, the on-disk reuse registry read, and the
 *   backend's `findRunning` answer for that name. The two reuse-incompatible
 *   spec shapes (a network join, a checkpoint ref) short-circuit the I/O:
 *   nothing is read, hashed, or probed for a spec that cannot be adopted.
 * - `decode` distills the observed facts into the `ReuseAdoptCommand` the
 *   adopt workflow declares.
 * - `decide` consumes the branded `decideReuseAdopt` workflow — the one
 *   place the opt-in/compat gates fire, pre-I/O — and maps the
 *   registry/readiness state table (adopt | clean-and-fresh | fresh).
 * - `encode` turns the `Result` into the act plan (a workflow rejection
 *   becomes `Refused` — the write resolves it to `undefined` with zero
 *   backend calls).
 * - `write` either returns the adopted handle — after re-running the
 *   container's OWN wait strategy against the recorded ports, so a running
 *   but unready sandbox is never adopted (upstream `tryAdopt`) — or
 *   resolves to `undefined` so the executor falls through to a fresh
 *   create. Every cleanup the decision names is best-effort; nothing here
 *   tears down an adopted container (R5: reuse-adopted containers are
 *   exempt from teardown — the executor marks `state.adopted`).
 *
 * The adoption result is never re-derived from backend inspection: the
 * handle the seam returns is exactly what `findRunning` answered, and the
 * backend's contract embeds `spec` verbatim. "Adoption returns the spec
 * verbatim" (upstream contract) holds by construction.
 */
import * as os from 'node:os'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Layer, Match, Result, Schema as S } from 'effect'
import { pipe } from 'effect/Function'

import { resolveCacheDir } from '../backend-msb/provisioner/env.kernel.js'
import type { AdoptRunningSeam } from '../lifecycle/launch.executor.js'
import type { ContainerSpec } from '../model/container-spec.schema.js'
import { BackendError, ReuseFromCheckpointError, ReuseWithNetworkError } from '../model/errors.js'
import { RightsizeConfig, type RightsizeConfigService } from '../runtime/config.js'
import type { SandboxHandle } from '../runtime/runtime.js'
import { SandboxRuntime } from '../runtime/runtime.js'
import { waitForReady, type WaitOptions } from '../wait/interpreter.js'
import { decideReuseAdopt, type ReuseAdoptDecision } from './adopt.workflow.js'
import { hashReuseSpec } from './hash.adapter.js'
import { mappedRecordToBindings, reuseName } from './hash.kernel.js'
import { readRegistry, type RegistryReadResult, removeRegistry } from './registry.js'

// =============================================================================
// The seam's knobs
// =============================================================================

/** The reuse seam's knobs. */
export interface ReuseSeamOptions {
  /** The rightsize cache dir — the reuse registry's home. Default: the platform default resolved from `RightsizeConfig`. */
  readonly cacheDir?: string | undefined
  /** The wait interpreter's knobs for the adopt-readiness re-verification. */
  readonly wait?: WaitOptions | undefined
}

/** The cache dir the seam resolves from config when no override was given (the same derivation the launch executor uses for hygiene). */
const defaultSeamCacheDir = (config: RightsizeConfigService): string =>
  resolveCacheDir({
    rightsizeCacheDir: config.cacheDir,
    platform: process.platform,
    homedir: os.homedir(),
    localAppData: process.env['LOCALAPPDATA'],
  })

// ============================================================================
// The adopt cell phase bag
// ============================================================================

/** The services this cell's effectful phases draw on. */
export type ReuseAdoptServices = RightsizeConfig | SandboxRuntime

/**
 * The facts the read phase gathers. `registry`/`running` are `undefined`
 * when the double opt-in failed or the spec carries a reuse-incompatible
 * shape — the read performed ZERO I/O then (no hash reads, no registry
 * read, no backend probe); `name`/`cacheDir`/`hash` are empty strings in
 * that case, never read by the decision.
 */
interface ReuseAdoptGathered {
  readonly reuseOptIn: boolean
  readonly networkId: string | undefined
  readonly checkpointRef: string | undefined
  readonly registry: RegistryReadResult | undefined
  readonly running: SandboxHandle | undefined
  readonly name: string
  readonly cacheDir: string
  readonly hash: string
}

type ReuseAdoptPlan =
  | { readonly _tag: 'Refused' }
  | { readonly _tag: 'Proceed'; readonly decision: ReuseAdoptDecision }

interface ReuseAdoptPhases extends Cell.Phases {
  readonly command: { readonly spec: ContainerSpec; readonly options: ReuseSeamOptions }
  readonly raw: ReuseAdoptGathered
  readonly decoded: Parameters<typeof decideReuseAdopt>[0]
  readonly decision: ReuseAdoptDecision
  readonly decisionError: ReuseWithNetworkError | ReuseFromCheckpointError
  readonly output: ReuseAdoptPlan
  readonly response: SandboxHandle | undefined
  readonly decodeError: never
  readonly readError: BackendError
  readonly writeError: never
  readonly readContext: ReuseAdoptServices
  readonly writeContext: ReuseAdoptServices
}

// ============================================================================
// The Read phase
// ============================================================================

const gatherReuseFacts = (
  command: ReuseAdoptPhases['command'],
): Effect.Effect<ReuseAdoptGathered, BackendError, ReuseAdoptServices> =>
  Effect.gen(function*() {
    const spec = command.spec
    const config = yield* RightsizeConfig
    const reuseOptIn = spec.keepAlive && config.reuse
    const networkId = spec.networkId
    const checkpointRef = spec.checkpointRef
    if (!reuseOptIn || networkId !== undefined || checkpointRef !== undefined) {
      return {
        reuseOptIn,
        networkId,
        checkpointRef,
        registry: undefined,
        running: undefined,
        name: '',
        cacheDir: '',
        hash: '',
      }
    }

    const cacheDir = command.options.cacheDir ?? defaultSeamCacheDir(config)
    const hash = yield* hashReuseSpec(spec)
    const name = reuseName(hash)
    const registry = yield* readRegistry(cacheDir, hash)

    // The find-running probe spec: the recorded mapped ports when a
    // registry entry exists (so the adopt readiness re-verification probes
    // the RIGHT host ports), else zero-marked bindings — the name is what
    // every backend matches on, the ports only shape the probe/wait.
    const ports = registry.kind === 'found'
      ? mappedRecordToBindings(registry.entry.ports)
      : spec.ports.map((binding): { readonly guestPort: number; readonly hostPort: number } => ({
        guestPort: binding.guestPort,
        hostPort: 0,
      }))
    const candidate: ContainerSpec = { ...spec, name, ports }

    const runtime = yield* SandboxRuntime
    const running = yield* runtime.findRunning(candidate)

    return { reuseOptIn, networkId, checkpointRef, registry, running, name, cacheDir, hash }
  })

const distillReuseFacts = (raw: ReuseAdoptGathered): ReuseAdoptPhases['decoded'] => ({
  _tag: 'DecideReuseAdopt',
  reuseOptIn: raw.reuseOptIn,
  networkId: raw.networkId,
  checkpointRef: raw.checkpointRef,
  registry: raw.registry,
  running: raw.running,
  name: raw.name,
  cacheDir: raw.cacheDir,
  hash: raw.hash,
})

const encodeReuseAdopt = (
  outcome: Result.Result<ReuseAdoptDecision, ReuseWithNetworkError | ReuseFromCheckpointError>,
): ReuseAdoptPlan =>
  Result.match(outcome, {
    onFailure: () => ({ _tag: 'Refused' }),
    onSuccess: (decision) => ({ _tag: 'Proceed', decision }),
  })

/**
 * The adopt description — one layer that gates pre-I/O and then acts,
 * built per invocation so the write can re-verify adoption readiness with
 * the seam's wait knobs.
 */
const adoptDescription = (spec: ContainerSpec, options: ReuseSeamOptions) =>
  pipe(
    Cell.read<ReuseAdoptPhases>((command) => gatherReuseFacts(command)),
    Cell.decode<ReuseAdoptPhases>((raw) => Result.succeed(distillReuseFacts(raw))),
    Cell.decide<ReuseAdoptPhases>(decideReuseAdopt),
    Cell.encode<ReuseAdoptPhases>((outcome) => encodeReuseAdopt(outcome)),
    Cell.write<ReuseAdoptPhases>((plan) => writeReuseAdopt(plan, options)),
  )

/**
 * The public seam factory — an effect over the services, yielding the
 * `AdoptRunningSeam` the launch executor's reuse branch consumes. The
 * double opt-in and the reuse-incompatible spec shapes resolve to
 * `undefined` (no adoption, zero backend calls) — the launch workflow's own
 * typed rejections remain the authoritative surface for a full launch.
 */
export const adoptRunningSeam = (
  options: ReuseSeamOptions = {},
): Effect.Effect<AdoptRunningSeam, never, ReuseAdoptServices> =>
  Effect.gen(function*() {
    const config = yield* RightsizeConfig
    const runtime = yield* SandboxRuntime
    const seamLayer = Layer.mergeAll(
      Layer.succeed(RightsizeConfig, config),
      Layer.succeed(SandboxRuntime, runtime),
    )
    const run = (spec: ContainerSpec): Effect.Effect<SandboxHandle | undefined, BackendError> =>
      Effect.gen(function*() {
        const cellOutcome = yield* Effect.result(
          Cell.apply(adoptDescription(spec, options), { spec, options }).pipe(Effect.provide(seamLayer)),
        )
        if (Result.isSuccess(cellOutcome)) {
          return cellOutcome.success
        }
        const failure = cellOutcome.failure
        // The reuse-incompatible spec shapes resolve to "no adoption" with
        // zero backend calls — the typed rejections remain the launch
        // workflow's authoritative surface for a full launch.
        if (S.is(ReuseWithNetworkError)(failure) || S.is(ReuseFromCheckpointError)(failure)) {
          return undefined
        }
        return yield* failure
      })
    return run
  })

// ============================================================================
// The adopt act — the write phase
// ============================================================================

/** Best-effort backend removal + registry removal — failures are swallowed. */
const cleanupStaleReuse = (
  name: string,
  cacheDir: string,
  hash: string,
  removeByName: boolean,
  removeRegistryFile: boolean,
): Effect.Effect<undefined, never, SandboxRuntime> =>
  Effect.gen(function*() {
    if (removeByName) {
      const runtime = yield* SandboxRuntime
      yield* runtime.removeByName(name).pipe(Effect.catchEager(() => Effect.void))
    }
    if (removeRegistryFile) {
      yield* removeRegistry(cacheDir, hash).pipe(Effect.catchEager(() => Effect.void))
    }
    return undefined
  })

/**
 * The adopt write: `Refused`/`Ignored`/`Fresh` resolve to `undefined` (the
 * executor creates fresh); `Cleanup` best-effort-removes the stale sandbox
 * and/or registry entry; `Adopt` re-verifies the running container with the
 * spec's OWN wait strategy against the recorded ports — an unready sandbox
 * is cleaned and `undefined` returned. Nothing here tears an adopted
 * container down (that is the executor's `state.adopted` exemption).
 */
const writeReuseAdopt = (
  plan: ReuseAdoptPlan,
  options: ReuseSeamOptions,
): Effect.Effect<SandboxHandle | undefined, never, ReuseAdoptServices> =>
  Match.value(plan).pipe(
    Match.tag('Refused', () => Effect.succeed('none' as const)),
    Match.tag('Proceed', ({ decision }: { readonly decision: ReuseAdoptDecision }) =>
      Match.value(decision).pipe(
        Match.tag('Ignored', () => Effect.succeed('none' as const)),
        Match.tag('Fresh', () => Effect.succeed('none' as const)),
        Match.tag(
          'Cleanup',
          ({ name, cacheDir, hash, removeByName, removeRegistry }) =>
            cleanupStaleReuse(name, cacheDir, hash, removeByName, removeRegistry).pipe(Effect.as('none' as const)),
        ),
        Match.tag('Adopt', ({ handle, cacheDir, hash }) =>
          Effect.gen(function*() {
            const verification = yield* Effect.result(waitForReady(handle, options.wait))
            if (Result.isSuccess(verification)) {
              return handle
            }
            // Not adoptable after all: clean the stale sandbox + registry
            // entry, and report no adoption so the executor creates fresh.
            yield* cleanupStaleReuse(handle.spec.name, cacheDir, hash, true, true)
            return 'none' as const
          })),
        Match.exhaustive,
      )),
    Match.exhaustive,
    Effect.map((outcome: 'none' | SandboxHandle) => (outcome === 'none' ? undefined : outcome)),
  )
