/**
 * The launch executor — the effectful half of F1, authored as a `Cell`
 * description (the repo's sandwich constructors: read → decode → decide →
 * encode → write, applied through the library's interpreter), and the
 * teardown executor — the same shape over the teardown workflow.
 *
 * The LAUNCH cell composes: `read` gathers the recorded facts a decision
 * needs (Selection, capabilities, `RIGHTSIZE_REUSE`, and the spec itself);
 * `decode` distills them into the exact `LaunchCommand` the launch
 * workflow declares; `decide` consumes the branded `decideLaunch`
 * workflow value — the one place a validation may run, pre-I/O; `encode`
 * turns the whole `Result` into the act plan the write executes (a
 * rejection travels to the write as a typed plan, so the write's very
 * first branch fails it with ZERO backend calls — a validation rejection
 * never reaches the runtime); `write` performs the launch act: scope
 * finalizer (the teardown executor), reaper bring-up, the reuse-adoption
 * seam, network ensure, port pre-allocation (R7), the create/start retry
 * loop with bind-conflict classification and release-between-attempts, the
 * sync-exit registration, network link installation, and the wait
 * interpreter.
 *
 * The TEARDOWN cell mirrors the shape: `read` gathers the recorded step
 * facts (which steps ran, membership, registry/ledger/port state),
 * `decode` distills the `TeardownCommand`, `decide` consumes the branded
 * `decideTeardown` workflow, `encode` passes the whole outcome forward,
 * and `write` runs the planned steps in the fixed order (R5:
 * stop → remove → network-remove → sync-unregister → untrack →
 * release-ports), each best-effort and recorded as completed, so a second
 * run is the workflow's `Completed` no-op. The same executor backs the
 * scope finalizer AND the public `stop()`/`remove()` — one implementation,
 * two surfaces (R5, KTD5).
 *
 * One deliberate deviation from the cell doctrine, named here: the
 * port-conflict retry budget — `decidePortConflict` — is consumed INSIDE
 * the launch write's loop rather than as a decide phase, because the
 * interpreter applies each layer exactly once (single-pass read →
 * decide → write), and a loop that allocates ports, boots, classifies, and
 * re-allocates between attempts has no layer-shaped home. Everything else
 * sandwich-shaped in this unit is a description.
 */
import { Cell } from '@systemfsoftware/effect-cell-types'
import type * as Scope from 'effect/Scope'

import { Effect, Match, Result } from 'effect'
import { pipe } from 'effect/Function'

import { registerDockerCleanupSync } from '../backend-docker/cli.js'
import { msbBinaryFor } from '../backend-msb/platform.js'
import { registerMsbCleanupSync } from '../backend-msb/runtime.js'
import { unregisterContainer } from '../fleet/registry.js'
import type { RuntimeCapabilities } from '../model/capabilities.js'
import type { ContainerSpec } from '../model/container-spec.js'
import { BackendError, ContainerLaunchError, UnsupportedByBackendError } from '../model/errors.js'
import { cacheDirFromConfig, RightsizeConfig } from '../runtime/config.js'
import type { RightsizeConfigService } from '../runtime/config.js'
import type { ReaperMode } from '../runtime/config.js'
import { FreePortExhaustedError, FreePorts } from '../runtime/free-ports.js'
import { RunId } from '../runtime/run-id.js'
import type { BackendName, NetworkLink, SandboxHandle } from '../runtime/runtime.js'
import { SandboxRuntime, VirtualNetworks } from '../runtime/runtime.js'
import type { SandboxRuntimeService, VirtualNetworksService } from '../runtime/runtime.js'
import { Selection } from '../runtime/selection.workflow.js'
import type { SelectionService } from '../runtime/selection.workflow.js'
import { waitForReady } from '../wait/interpreter.js'
import type { WaitOptions } from '../wait/interpreter.js'
import { InvalidWaitStrategyError } from '../wait/verdict.js'
import {
  dockerKillCommands,
  msbKillCommands,
  type ProcessTimeSource,
  type ReaperKillCommands,
} from './hygiene/ledger.js'
import { registerSyncCleanup, unregisterSyncCleanup } from './hygiene/sync-exit.js'
import {
  ensureReaperInitialized,
  isLedgerActive,
  recordSandboxIdLedger,
  trackNetworkLedger,
  trackSandboxLedger,
  untrackNetworkLedger,
  untrackSandboxLedger,
} from './hygiene/watchdog.js'
import { decideLaunch, type LaunchCommand, type LaunchDecision, type LaunchError } from './launch.workflow.js'
import { decidePortConflict } from './port-conflict.workflow.js'
import {
  decideTeardown,
  type TeardownCommand,
  type TeardownDecision,
  type TeardownFactContradictionError,
  type TeardownStep,
} from './teardown.workflow.js'

// =============================================================================
// Public options and the running handle
// =============================================================================

/** The reuse-adoption seam (U10's slot): adopts a running reuse container for this spec, or `undefined` when none is adoptable. */
export type AdoptRunningSeam = (spec: ContainerSpec) => Effect.Effect<SandboxHandle | undefined, BackendError>

/** The launch knob surface — every option exists so tests script the recording doubles without real sockets, and every default is the upstream value. */
export interface LaunchOptions {
  /** The module preset's expected repository, when the spec came from a module (U11) — the pre-I/O image gate (R13). */
  readonly expectedRepository?: string | undefined
  /** The backend that minted the spec's checkpoint ref (U10); `undefined` for every ordinary container. */
  readonly checkpointSourceBackend?: string | undefined
  /** The reuse-adoption seam (default: never adopt). */
  readonly adoptRunning?: AdoptRunningSeam | undefined
  /** Explicit links toward already-running network siblings (default: derived from the in-process member registry). */
  readonly networkLinks?: ReadonlyArray<NetworkLink> | undefined
  /** The wait interpreter's knobs. */
  readonly wait?: WaitOptions | undefined
  /** Hygiene overrides — defaults resolve from `RightsizeConfig` + `Selection`. */
  readonly hygiene?: {
    readonly cacheDir?: string | undefined
    readonly reaper?: ReaperMode | undefined
    readonly killCommands?: ReaperKillCommands | undefined
    readonly cleanupSync?: ((id: string) => void) | undefined
    readonly runKill?: ((argv: ReadonlyArray<string>) => void) | undefined
    readonly timeSource?: ProcessTimeSource | undefined
    readonly spawnChild?: ((command: string, argv: ReadonlyArray<string>) => { readonly close: () => void }) | undefined
  } | undefined
}

/** The renderable handle a successful launch returns — bound to its state so the facade's runtime ops and stop/remove stay stateless. */
export interface RunningHandle {
  /** The backend-native handle: the durable container id (the byId surface, U8) + the final spec. */
  readonly handle: SandboxHandle
  /** Which backend runs this container. */
  readonly backend: BackendName
  /** The final spec exactly as the backend saw it (runId, derived name, allocated ports). */
  readonly spec: ContainerSpec
  /** The per-launch state the teardown executor runs on — shared by the scope finalizer and the facade. */
  readonly state: LaunchState
  /** Stops/removes the container through the shared teardown executor. Idempotent; never throws. */
  readonly stop: Effect.Effect<void, never, SandboxRuntime | VirtualNetworks>
  /** Alias of `stop` on the explicit-release surface. Idempotent. */
  readonly remove: Effect.Effect<void, never, SandboxRuntime | VirtualNetworks>
}

/**
 * The per-launch mutable state the teardown executor reads and records
 * against. Every fact except `completed` is a snapshot taken at gather time
 * and never flipped mid-teardown — the teardown decision's resume-after-
 * interruption contract (the `completed` record is always the initial
 * segment of the applicable order of the CURRENT snapshot).
 */
export interface LaunchState {
  readonly spec: ContainerSpec
  readonly backend: BackendName
  readonly cleanupSync: ((id: string) => void) | undefined
  /** The backend handle once one exists. */
  handle: SandboxHandle | undefined
  /** `true` when this container was adopted from a running reuse sandbox, not created by this launch. */
  adopted: boolean
  /** `true` when a backend handle was created (only then do stop/remove apply). */
  created: boolean
  /** The network this container joined (library-created), once ensured. */
  networkId: string | undefined
  /** Whether this container was registered as a member of that network. */
  registeredAsMember: boolean
  /** Whether the sync-exit registry holds this container. */
  syncCleanupRegistered: boolean
  /** Whether the on-disk ledger tracks this container. */
  ledgerTracked: boolean
  /** Whether host ports were allocated by this launch and are still issued. */
  portsIssued: boolean
  /** The host ports this launch allocated (released on the teardown `release-ports` step). */
  allocatedPorts: ReadonlyArray<number>
  /** The teardown steps already performed — always the initial segment of the applicable order. */
  completed: ReadonlyArray<TeardownStep>
}

const makeLaunchState = (
  spec: ContainerSpec,
  backend: BackendName,
  cleanupSync: ((id: string) => void) | undefined,
): LaunchState => ({
  spec,
  backend,
  cleanupSync,
  handle: undefined,
  adopted: false,
  created: false,
  networkId: undefined,
  registeredAsMember: false,
  syncCleanupRegistered: false,
  ledgerTracked: false,
  portsIssued: false,
  allocatedPorts: [],
  completed: [],
})

// =============================================================================
// The launch cell — read / decode / decide / encode / write
// =============================================================================

/** The services this cell's effectful phases draw on. */
export type LaunchServices = Selection | RightsizeConfig | SandboxRuntime | VirtualNetworks

/** The launch cell's phase bag. */
interface LaunchPhases extends Cell.Phases {
  readonly command: { readonly spec: ContainerSpec; readonly options: LaunchOptions }
  readonly raw: LaunchGathered
  readonly decoded: LaunchCommand
  readonly decision: LaunchDecision
  readonly decisionError: LaunchError
  readonly output: LaunchPlan
  readonly response: RunningHandle
  readonly decodeError: never
  readonly readError: never
  readonly writeError: LaunchCellError
  readonly readContext: LaunchServices
  readonly writeContext: LaunchServices | Scope.Scope
}

/** The facts the read phase gathers — every one is a property read, no I/O. */
interface LaunchGathered {
  readonly spec: ContainerSpec
  readonly options: LaunchOptions
  readonly backend: BackendName
  readonly capabilities: RuntimeCapabilities
  readonly reuseEnabled: boolean
}

/** The act plan the write executes: `Launch` proceeds, `Refuse` fails with the typed rejection (zero backend calls). */
type LaunchPlan = { readonly _tag: 'Launch' } | { readonly _tag: 'Refuse'; readonly error: LaunchError }

/** Every error the launch cell can surface on its write channel. */
export type LaunchCellError =
  | LaunchError
  | ContainerLaunchError
  | BackendError
  | InvalidWaitStrategyError
  | UnsupportedByBackendError
  | FreePortExhaustedError

const gatherLaunchFacts = (command: LaunchPhases['command']): Effect.Effect<LaunchGathered, never, LaunchServices> =>
  Effect.gen(function*() {
    const selection = yield* Selection
    const config = yield* RightsizeConfig
    const runtime = yield* SandboxRuntime
    return {
      spec: command.spec,
      options: command.options,
      backend: selection.backend,
      capabilities: runtime.capabilities,
      reuseEnabled: config.reuse,
    }
  })

const distillLaunch = (raw: LaunchGathered): LaunchCommand => ({
  _tag: 'ValidateLaunch',
  spec: raw.spec,
  backend: raw.backend,
  capabilities: raw.capabilities,
  reuseRequested: raw.spec.keepAlive,
  reuseEnabled: raw.reuseEnabled,
  expectedRepository: raw.options.expectedRepository,
  checkpointSourceBackend: raw.options.checkpointSourceBackend,
})

const encodeLaunch = (outcome: Result.Result<LaunchDecision, LaunchError>): LaunchPlan =>
  Result.match(outcome, {
    onFailure: (error) => ({ _tag: 'Refuse', error }),
    onSuccess: () => ({ _tag: 'Launch' }),
  })

/**
 * The launch cell — one layer that gates pre-I/O and then acts. The
 * description is built per launch: the write phase closes over the spec
 * and options, the same way the repository's restart description closes
 * over its failure's context.
 */
const launchDescription = (spec: ContainerSpec, options: LaunchOptions) =>
  pipe(
    Cell.read<LaunchPhases>((command) => gatherLaunchFacts(command)),
    Cell.decode<LaunchPhases>((raw) => Result.succeed(distillLaunch(raw))),
    Cell.decide<LaunchPhases>(decideLaunch),
    Cell.encode<LaunchPhases>((outcome) => encodeLaunch(outcome)),
    Cell.write<LaunchPhases>((plan) => launchAct(plan, spec, options)),
  )

/** The public launch entry — the Cell applied through the library's interpreter. */
export const launchContainer = (
  spec: ContainerSpec,
  options: LaunchOptions = {},
): Effect.Effect<RunningHandle, LaunchCellError, LaunchServices | Scope.Scope> =>
  Cell.apply(launchDescription(spec, options), { spec, options })

// =============================================================================
// The launch act — the write phase's contents
// =============================================================================

// Per-process launch sequence (upstream's `nextSequence`): every attempt of
// every launch mints a fresh run-scoped name.
let sequence = 0
const nextSequence = (): number => {
  sequence += 1
  return sequence
}

/** One network member's registered alias + port surface — what later siblings link to. */
interface NetworkMemberRecord {
  readonly name: string
  readonly aliases: ReadonlyArray<string>
  readonly bindings: ReadonlyArray<{ readonly guestPort: number; readonly hostPort: number }>
}

/** The in-process registry of network members: networkId → (name → record). A member leaves on its stop step; the network's last-member removal is decided by the empty set. */
const networkMembers = new Map<string, Map<string, NetworkMemberRecord>>()

const memberCountFor = (networkId: string): number => networkMembers.get(networkId)?.size ?? 0

const registerMember = (networkId: string, record: NetworkMemberRecord): void => {
  const members = networkMembers.get(networkId) ?? new Map<string, NetworkMemberRecord>()
  members.set(record.name, record)
  networkMembers.set(networkId, members)
}

/** Removes a member — its stop step ran, so it is no longer a linkable running sibling. */
const removeMember = (networkId: string, name: string): void => {
  const members = networkMembers.get(networkId)
  if (members === undefined) {
    return
  }
  members.delete(name)
  if (members.size === 0) {
    networkMembers.delete(networkId)
  }
}

/** The links a newly-starting container needs toward every already-running sibling (upstream `linksForNewMember` semantics). */
const linksTowardMembers = (networkId: string): ReadonlyArray<NetworkLink> => {
  const links: NetworkLink[] = []
  for (const record of networkMembers.get(networkId)?.values() ?? []) {
    for (const alias of record.aliases) {
      for (const binding of record.bindings) {
        links.push({ alias, guestPort: binding.guestPort, targetHostPort: binding.hostPort })
      }
    }
  }
  return links
}

// =============================================================================
// Hygiene defaults — resolved from Selection + config where options don't override
// =============================================================================

/** The reaper's resolved surroundings: where the ledger lives, the mode, and the active backend's kill commands + blocking cleanup. */
export interface ResolvedHygiene {
  readonly cacheDir: string
  readonly reaper: ReaperMode
  readonly kill: ReaperKillCommands | undefined
  /** The synchronous per-container cleanupSync — docker's curl DELETE / msb's spawnSync; a no-op when no msb binary resolved. */
  readonly cleanupSync: (id: string) => void
}

const resolveHygiene = (
  config: RightsizeConfigService,
  selection: SelectionService,
  overrides: LaunchOptions['hygiene'],
): ResolvedHygiene => {
  const cacheDir = overrides?.cacheDir ?? cacheDirFromConfig(config)
  const reaper = overrides?.reaper ?? config.reaper
  if (selection.backend === 'docker') {
    return {
      cacheDir,
      reaper,
      kill: overrides?.killCommands ?? dockerKillCommands(),
      cleanupSync: overrides?.cleanupSync ?? registerDockerCleanupSync(selection.dockerSocketPath ?? ''),
    }
  }
  const msbPath = msbBinaryFor(config, cacheDir)
  return {
    cacheDir,
    reaper,
    kill: overrides?.killCommands ?? (msbPath === undefined ? undefined : msbKillCommands(msbPath)),
    cleanupSync: overrides?.cleanupSync ??
      (msbPath === undefined ? () => {} : (id: string) => registerMsbCleanupSync(msbPath, id)),
  }
}

// =============================================================================
// The act write phase
// =============================================================================

const swallow = <A, E extends object>(effect: Effect.Effect<A, E>): Effect.Effect<void> =>
  effect.pipe(Effect.catchEager(() => Effect.void), Effect.as(undefined))

/** The bindings of `spec` that still need a live host port (the pre-allocation marker is 0). */
const unallocatedCount = (spec: ContainerSpec): number => spec.ports.filter((binding) => binding.hostPort === 0).length

/** A spec with every unallocated binding replaced by a real host port, plus the run identity filled in and a fresh per-attempt name. */
const finalizeAttemptSpec = (spec: ContainerSpec, hostPorts: ReadonlyArray<number>): ContainerSpec => {
  let index = 0
  const ports = spec.ports.map((binding) =>
    binding.hostPort === 0
      ? { guestPort: binding.guestPort, hostPort: hostPorts[index++] ?? 0 }
      : binding
  )
  return { ...spec, name: `rz-${RunId.value}-${nextSequence()}`, runId: RunId.value, ports }
}

const toRunningHandle = (state: LaunchState): RunningHandle => {
  const handle = state.handle
  if (handle === undefined) {
    // Unreachable: every path that builds a handle first assigned one.
    throw new Error('launch: handleValue reached without a handle — executor bug')
  }
  return {
    handle,
    backend: state.backend,
    spec: handle.spec,
    state,
    stop: teardownRun(state).pipe(Effect.catchEager(() => Effect.void)),
    remove: teardownRun(state).pipe(Effect.catchEager(() => Effect.void)),
  }
}

/**
 * The launch act: every create/start/network/wait step, composed in the
 * runtime's own interruptible model. Interruptions have no catch here — the
 * scope finalizer registered as the act's FIRST effect is what cleans up;
 * failures tear the partial state down explicitly before the rejection.
 */
const launchAct = (
  plan: LaunchPhases['output'],
  originalSpec: ContainerSpec,
  options: LaunchOptions,
): Effect.Effect<RunningHandle, LaunchCellError, LaunchServices | Scope.Scope> =>
  Match.value(plan).pipe(
    Match.tag('Refuse', (refusal) => Effect.fail(refusal.error)),
    Match.tag('Launch', () =>
      Effect.gen(function*() {
        const selection = yield* Selection
        const config = yield* RightsizeConfig
        const networks = yield* VirtualNetworks

        const hygiene = resolveHygiene(config, selection, options.hygiene)
        const state = makeLaunchState(originalSpec, selection.backend, hygiene.cleanupSync)

        // The scope finalizer is registered BEFORE the first backend
        // call: an interruption anywhere in the launch closes the scope
        // and runs the teardown executor over whatever partial state
        // exists — nothing leaks (R5-F2).
        yield* Effect.addFinalizer(() => teardownRun(state).pipe(Effect.catchEager(() => Effect.void)))

        // Reaper bring-up: memoized per backend; a ledger outage never
        // stalls the launch (tracking silently degrades).
        yield* ensureReaperInitialized({
          cacheDir: hygiene.cacheDir,
          backend: selection.backend,
          kill: hygiene.kill ?? dockerKillCommands(),
          mode: hygiene.reaper,
          runKill: options.hygiene?.runKill,
          timeSource: options.hygiene?.timeSource,
          spawnChild: options.hygiene?.spawnChild,
        }).pipe(Effect.catchEager(() => Effect.void))

        // The reuse seam (U10's slot): a keepAlive + env-enabled spec
        // that hits a running reuse container is ADOPTED — no create, no
        // ledger, no sync (R5: reuse-adopted containers are exempt).
        if (state.spec.keepAlive && config.reuse && options.adoptRunning !== undefined) {
          const adopted = yield* options.adoptRunning(state.spec).pipe(Effect.catchEager(() => Effect.void))
          if (adopted !== undefined) {
            state.handle = adopted
            state.created = true
            state.adopted = true
            return toRunningHandle(state)
          }
        }

        // Network ensure happens once, before the port retry loop (it is
        // independent of which ports each attempt binds).
        const networkId = state.spec.networkId
        if (networkId !== undefined) {
          yield* networks.ensureNetwork(networkId).pipe(Effect.catchEager(() => Effect.void))
          state.networkId = networkId
          if (!state.spec.keepAlive) {
            yield* trackNetworkLedger(networkId).pipe(Effect.catchEager(() => Effect.void))
          }
        }

        state.ledgerTracked = isLedgerActive() && !state.spec.keepAlive
        const handle = yield* bootWithRetryLoop(state)
        state.handle = handle
        state.created = true

        // Sync-exit registration: only non-keepAlive, and only once
        // booted — a keepAlive container must outlive this process.
        const cleanupSync = state.cleanupSync
        if (!state.spec.keepAlive && cleanupSync !== undefined) {
          registerSyncCleanup(handle.id, () => cleanupSync(handle.id))
          state.syncCleanupRegistered = true
        }

        // Network links toward already-running siblings, then
        // membership — a container must never see itself in its own
        // links (upstream order).
        if (state.networkId !== undefined) {
          const links = options.networkLinks ?? linksTowardMembers(state.networkId)
          yield* networks.installNetworkLinks(handle, links).pipe(Effect.catchEager(() => Effect.void))
          registerMember(state.networkId, {
            name: handle.spec.name,
            aliases: state.spec.aliases,
            bindings: handle.spec.ports.map((binding) => ({
              guestPort: binding.guestPort,
              hostPort: binding.hostPort,
            })),
          })
          state.registeredAsMember = true
        }

        // The wait interpreter — interruptible at every poll (R11).
        yield* waitForReady(handle, options.wait)

        return toRunningHandle(state)
      })),
    Match.exhaustive,
  )

/** One create+start attempt. A start failure tears the created container down inside the attempt — the retry loop never sees a half-booted handle. The failure channel normalizes to `BackendError` carrying the daemon's message, which is exactly what the retry classifier reads (upstream `isPortBindConflict`). */
const bootAttempt = (
  runtime: SandboxRuntimeService,
  attemptSpec: ContainerSpec,
): Effect.Effect<SandboxHandle, BackendError, never> =>
  Effect.gen(function*() {
    const created = yield* runtime.create(attemptSpec)
    const started = yield* Effect.result(runtime.start(created))
    if (Result.isFailure(started)) {
      yield* swallow(runtime.stop(created))
      yield* swallow(runtime.remove(created))
      return yield* BackendError.make({ message: failureMessage(started.failure) })
    }
    return created
  })

/** Renders a backend failure value into the message the classifier reads. */
const failureMessage = (failure: unknown): string => {
  if (typeof failure === 'object' && failure !== null && 'message' in failure && typeof failure.message === 'string') {
    return failure.message
  }
  return typeof failure === 'string' ? failure : 'backend failure'
}

/**
 * The create/start retry loop — one attempt per pre-allocated port set, a
 * bind conflict classified by the retry workflow (≤5 attempts, R7), ports
 * released and re-allocated between attempts, every failure path releasing
 * its ports. The ledger is appended BEFORE create (it is always a superset
 * of live sandboxes) and the attempt's name is untracked on failure.
 */
const bootWithRetryLoop = (state: LaunchState): Effect.Effect<SandboxHandle, LaunchCellError, LaunchServices> =>
  Effect.gen(function*() {
    const runtime = yield* SandboxRuntime
    let attemptsUsed = 0
    while (true) {
      const count = unallocatedCount(state.spec)
      const currentPorts = count === 0 ? [] : yield* FreePorts.allocate(count)
      state.allocatedPorts = [...currentPorts]
      state.portsIssued = count > 0

      const attemptSpec = finalizeAttemptSpec(state.spec, currentPorts)
      const name = attemptSpec.name

      if (state.ledgerTracked) {
        yield* trackSandboxLedger({ kind: 'sandbox', backend: state.backend, name }).pipe(
          Effect.catchEager(() => Effect.void),
        )
      }
      const booted = yield* Effect.result(bootAttempt(runtime, attemptSpec))
      if (Result.isFailure(booted)) {
        if (state.ledgerTracked) {
          untrackSandboxLedger(name)
        }
        for (const port of currentPorts) {
          yield* FreePorts.release(port)
        }
        state.allocatedPorts = []
        state.portsIssued = false

        const gate = decidePortConflict({
          _tag: 'ClassifyLaunchFailure',
          image: state.spec.image,
          error: booted.failure,
          attemptsUsed: attemptsUsed + 1,
        })
        if (Result.isFailure(gate)) {
          // Budget exhausted — every attempt hit a bind conflict.
          return yield* gate.failure
        }
        const retry = Match.value(gate.success).pipe(
          Match.tag('Propagate', () => Effect.fail(booted.failure)),
          Match.tag('Retry', (decision) => Effect.succeed(decision)),
          Match.exhaustive,
        )
        const retryDecision = yield* retry
        attemptsUsed = retryDecision.nextAttempt - 1
      } else {
        if (state.ledgerTracked) {
          recordSandboxIdLedger(name, booted.success.id)
        }
        return booted.success
      }
    }
  })

// =============================================================================
// The teardown cell — read / decode / decide / encode / write
// =============================================================================

/** The teardown cell's phase bag. */
interface TeardownPhases extends Cell.Phases {
  readonly command: 'teardown'
  readonly raw: TeardownFactsSnapshot
  readonly decoded: TeardownCommand
  readonly decision: TeardownDecision
  readonly decisionError: TeardownFactContradictionError
  readonly output: Result.Result<TeardownDecision, TeardownFactContradictionError>
  readonly response: void
  readonly decodeError: never
  readonly readError: never
  readonly writeError: TeardownFactContradictionError
  readonly readContext: never
  readonly writeContext: SandboxRuntime | VirtualNetworks
}

/** The recorded facts the teardown gather observes — a snapshot taken at gather time, exactly the workflow's command shape. */
interface TeardownFactsSnapshot {
  readonly keepAlive: boolean
  readonly adopted: boolean
  readonly created: boolean
  readonly completed: ReadonlyArray<TeardownStep>
  readonly networkId: string | undefined
  readonly isLastNetworkMember: boolean
  readonly syncCleanupRegistered: boolean
  readonly ledgerTracked: boolean
  readonly portsIssued: boolean
}

const gatherTeardownFacts = (state: LaunchState): Effect.Effect<TeardownFactsSnapshot> =>
  Effect.sync(() => {
    const networks = state.networkId
    const ownsNetwork = networks !== undefined
    const remainingCount = ownsNetwork ? memberCountFor(networks) - (state.registeredAsMember ? 1 : 0) : 0
    return {
      keepAlive: state.spec.keepAlive,
      adopted: state.adopted,
      created: state.created,
      completed: state.completed,
      networkId: networks,
      isLastNetworkMember: ownsNetwork && remainingCount === 0,
      syncCleanupRegistered: state.syncCleanupRegistered,
      ledgerTracked: state.ledgerTracked,
      portsIssued: state.portsIssued,
    }
  })

const distillTeardown = (facts: TeardownFactsSnapshot): TeardownCommand => ({
  _tag: 'TearDown',
  keepAlive: facts.keepAlive,
  adopted: facts.adopted,
  created: facts.created,
  completed: facts.completed,
  networkId: facts.networkId,
  isLastNetworkMember: facts.isLastNetworkMember,
  syncCleanupRegistered: facts.syncCleanupRegistered,
  ledgerTracked: facts.ledgerTracked,
  portsIssued: facts.portsIssued,
})

/**
 * The teardown description — one layer that plans the ordered remaining
 * steps and executes them. Built per state: the write phase needs the
 * state to mutate `completed` against (the cell type's terminal brand
 * closes over nothing else).
 */
const teardownDescription = (state: LaunchState) =>
  pipe(
    Cell.read<TeardownPhases>(() => gatherTeardownFacts(state)),
    Cell.decode<TeardownPhases>((facts) => Result.succeed(distillTeardown(facts))),
    Cell.decide<TeardownPhases>(decideTeardown),
    Cell.encode<TeardownPhases>((outcome) => outcome),
    Cell.write<TeardownPhases>((outcome) => writeTeardown(outcome, state)),
  )

/** The shared teardown executor — the scope finalizer AND the public `stop()`/`remove()` both resolve to this. */
export const teardownRun = (
  state: LaunchState,
): Effect.Effect<void, TeardownFactContradictionError, SandboxRuntime | VirtualNetworks> =>
  Cell.apply(teardownDescription(state), 'teardown' as const)

const writeTeardown = (
  outcome: Result.Result<TeardownDecision, TeardownFactContradictionError>,
  state: LaunchState,
): Effect.Effect<void, TeardownFactContradictionError, SandboxRuntime | VirtualNetworks> =>
  Result.match(outcome, {
    onFailure: (contradiction) => Effect.fail(contradiction),
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('Skipped', () => Effect.void),
        Match.tag('Completed', () => Effect.void),
        Match.tag('Steps', (planned) => runTeardownSteps(planned.steps, state)),
        Match.exhaustive,
      ),
  })

const runTeardownSteps = (
  steps: ReadonlyArray<TeardownStep>,
  state: LaunchState,
): Effect.Effect<void, never, SandboxRuntime | VirtualNetworks> =>
  Effect.forEach(steps, (step) =>
    Effect.gen(function*() {
      const runtime = yield* SandboxRuntime
      const networks = yield* VirtualNetworks
      yield* executeTeardownStep(step, state, runtime, networks)
      state.completed = [...state.completed, step]
      return undefined
    })).pipe(Effect.as(undefined))

/** One teardown step — every effectful call best-effort, so a second run is a no-op and a mid-teardown failure never blocks the remaining steps. */
const executeTeardownStep = (
  step: TeardownStep,
  state: LaunchState,
  runtime: SandboxRuntimeService,
  networks: VirtualNetworksService,
): Effect.Effect<void> => {
  const handle = state.handle
  switch (step) {
    case 'stop':
      return handle === undefined
        ? Effect.void
        : state.networkId === undefined
        ? swallow(runtime.stop(handle))
        : Effect.andThen(
          swallow(runtime.stop(handle)),
          Effect.sync(() => removeMember(state.networkId ?? '', handle.spec.name)),
        )
    case 'remove':
      // The fleet registry's row dies with the container: a torn-down
      // container must stop reporting as live (the registry's own
      // invariant). Absent-key delete is a no-op for never-minted rows.
      return handle === undefined
        ? Effect.void
        : swallow(runtime.remove(handle)).pipe(
          Effect.andThen(Effect.sync(() => unregisterContainer(state.backend, handle.id))),
        )
    case 'network-remove':
      return state.networkId === undefined
        ? Effect.void
        : swallow(networks.removeNetwork(state.networkId)).pipe(
          Effect.andThen(
            Effect.sync(() => {
              const networkId = state.networkId
              if (networkId !== undefined) {
                networkMembers.delete(networkId)
                untrackNetworkLedger(networkId)
              }
            }),
          ),
        )
    case 'sync-unregister':
      return Effect.sync(() => {
        if (handle !== undefined) {
          unregisterSyncCleanup(handle.id)
        }
      })
    case 'untrack':
      // The ledger tracked the DERIVED attempt name (`rz-<runId>-<seq>`), not
      // the raw spec name — the successful attempt's handle carries it.
      return Effect.sync(() => {
        untrackSandboxLedger(state.handle?.spec.name ?? state.spec.name)
      })
    case 'release-ports':
      return Effect.gen(function*() {
        for (const port of state.allocatedPorts) {
          yield* FreePorts.release(port)
        }
        state.allocatedPorts = []
        return undefined
      })
  }
}
