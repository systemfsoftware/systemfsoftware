/**
 * Backend selection — the decision that picks which runtime answers an
 * execution request (R8, KTD4).
 *
 * The decision is a `Workflow.make` boundary (the repo's sandwich doctrine
 * from `@systemfsoftware/effect-cell-types`): the composing layer distills
 * the recorded facts — the `RIGHTSIZE_BACKEND` preference, the recorded
 * probe verdicts, and the msb capability gate — into a closed command union,
 * and the workflow body is one exhaustive `Match.tag` dispatch over it, so
 * the decision is unit-tested with recorded probe results instead of live
 * sockets.
 *
 * Resolution order (the layer builds the command; the workflow decides):
 * - an explicit `msb` preference selects msb (its runnability is the
 *   provisioner gate, landed with the msb backend unit — sockets have
 *   nothing to do with it);
 * - an explicit `docker` preference requires a live docker probe — none
 *   live is the forced-but-unreachable failure, naming every probe;
 * - `auto` applies the supported-priority rule deliberately kept from
 *   upstream: msb > docker (hardware isolation is this library's point).
 *   With the msb capability gate answering `false` (the default until the
 *   msb unit lands its owned gate), auto falls to the first live socket
 *   probe in priority order, or fails naming the probes when nothing
 *   answered.
 *
 * `layerAuto` is the composition seam that supplies the recorded facts from
 * `Config` + the discovery probe battery and yields the `Selection` service:
 * the backend to use and, for docker, the socket path the client must dial.
 * The backend Layers themselves (layerDocker/layerMsb) land in their owning
 * units; this unit exports the selection service Tag and the auto layer
 * only, with no stub code.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Context, Effect, Layer, Match, Result, Schema as S } from 'effect'
import { type BackendPreference, RightsizeConfig } from './config.js'
import { RuntimeDiscovery, UnsupportedDockerHostError } from './discovery/discovery.adapter.js'
import { type SocketProbeVerdict } from './discovery/probe.kernel.js'
import type { BackendName } from './runtime.js'

// =============================================================================
// Decisions + failure
// =============================================================================

/** Backend selection decided: the microsandbox backend. */
export class SelectionMsb extends S.TaggedClass<SelectionMsb>()('Msb', {}) {}

/** Backend selection decided: the docker backend, dialing `socketPath`. */
export class SelectionDocker extends S.TaggedClass<SelectionDocker>()('Docker', { socketPath: S.String }) {}

/** The closed decision space of the selection workflow. */
export type SelectionDecision = SelectionDocker | SelectionMsb

/** One probed candidate and its verdict, as the failure carries it. */
export const ProbeRecord = S.Struct({
  id: S.String,
  socketPath: S.String,
  live: S.Boolean,
}).pipe(S.annotate({ identifier: 'ProbeRecord', title: 'ProbeRecord' }))

export type ProbeRecord = S.Schema.Type<typeof ProbeRecord>

/**
 * A forced-but-unreachable backend: nothing answered the probes. The probe
 * list — every candidate and its verdict — rides along (R8: the error
 * recites what was probed; the lanes' existing error contract, now
 * library-owned).
 */
export class BackendUnreachableError extends S.TaggedError<BackendUnreachableError>()('BackendUnreachableError', {
  requested: S.Literals(['auto', 'docker', 'msb']),
  probes: S.Array(ProbeRecord),
}) {}

// =============================================================================
// Command + decision kernels
// =============================================================================

/** The recorded facts the selection decision runs on, distilled by the composing layer into a closed union. */
export type SelectionCommand =
  | { readonly _tag: 'PreferMsb' }
  | {
    readonly _tag: 'PreferDocker'
    /** Every probed candidate and verdict, in priority order (the error recital). */
    readonly probes: ReadonlyArray<ProbeRecord>
    /** The first live verdict, or `undefined` when nothing answered. */
    readonly first: SocketProbeVerdict | undefined
  }
  | {
    readonly _tag: 'PreferAuto'
    /** Every probed candidate and verdict, in priority order (the error recital). */
    readonly probes: ReadonlyArray<ProbeRecord>
    /** The first live verdict, or `undefined` when nothing answered. */
    readonly first: SocketProbeVerdict | undefined
    /** The recorded msb capability gate (virtualization decision); auto prefers msb when `true`. */
    readonly msbSupported: boolean
  }

const recordsFromProbes = (probes: ReadonlyArray<SocketProbeVerdict>): ReadonlyArray<ProbeRecord> =>
  probes.map((probe) => ({ id: probe.id, socketPath: probe.socketPath, live: probe.live }))

/** The docker lane's decision: first live verdict wins, else the named failure. */
const dockerDecision = (
  requested: 'auto' | 'docker',
  command: Extract<SelectionCommand, { readonly _tag: 'PreferDocker' | 'PreferAuto' }>,
): Result.Result<SelectionDocker, BackendUnreachableError> =>
  command.first === undefined
    ? Result.fail(BackendUnreachableError.make({ requested, probes: command.probes }))
    : Result.succeed(SelectionDocker.make({ socketPath: command.first.socketPath }))

/** The auto lane's verdict: msb first when its gate answers, else the docker decision. */
const autoDecision = (
  command: Extract<SelectionCommand, { readonly _tag: 'PreferAuto' }>,
): Result.Result<SelectionDecision, BackendUnreachableError> =>
  command.msbSupported === true
    ? Result.succeed(SelectionMsb.make())
    : dockerDecision('auto', command)

/** The base dispatch — pure, in-file; the workflow body is this one call. */
const dispatchSelection = (
  command: SelectionCommand,
): Result.Result<SelectionDecision, BackendUnreachableError> =>
  Match.exhaustive(
    Match.value(command).pipe(
      Match.tag('PreferMsb', () => Result.succeed(SelectionMsb.make())),
      Match.tag('PreferDocker', (c) => dockerDecision('docker', c)),
      Match.tag('PreferAuto', (c) => autoDecision(c)),
    ),
  )

/**
 * The one base-selection decision, authored at the `Workflow.make` boundary.
 * The body is a single dispatch expression; all branching lives in the
 * kernels above, no I/O anywhere in here.
 */
export const decideSelection = Workflow.make(
  (command: SelectionCommand): Result.Result<SelectionDecision, BackendUnreachableError> => dispatchSelection(command),
)

// =============================================================================
// Selection service + the auto layer
// =============================================================================

/** The selected backend: the board the facade composes the backend Layers over. */
export interface SelectionService {
  /** Which backend was selected. */
  readonly backend: BackendName
  /** The docker socket path to dial — present exactly when `backend === 'docker'`. */
  readonly dockerSocketPath: string | undefined
}

/** The selection service Tag — the composition point the backend Layers (U6b/U9b) resolve against. */
export class Selection extends Context.Service<Selection, SelectionService>()(
  '@systemfsoftware/rightsize/runtime/selection.workflow/Selection',
) {}

/** Options for the auto layer. The msb capability gate is a recorded fact, not a probe this unit owns; it defaults `false` until the msb backend unit supplies its owned gate. */
export interface AutoSelectionOptions {
  /** The recorded msb capability gate (kvm/WHP); `false` when unset. */
  readonly msbSupported?: boolean | undefined
}

/** The decision interpreter — the selection value the backend Layers consume. */
export const selectionFromDecision = (decision: SelectionDecision): SelectionService =>
  Match.exhaustive(
    Match.value(decision).pipe(
      Match.tag(
        'Msb',
        (): { backend: 'msb'; dockerSocketPath: undefined } => ({ backend: 'msb', dockerSocketPath: undefined }),
      ),
      Match.tag(
        'Docker',
        (docker): { backend: 'docker'; dockerSocketPath: string } => ({
          backend: 'docker',
          dockerSocketPath: docker.socketPath,
        }),
      ),
    ),
  )

/** Distill the config preference + recorded verdicts into the closed command union. */
const toCommand = (
  preference: BackendPreference,
  probes: ReadonlyArray<SocketProbeVerdict>,
  msbSupported: boolean,
): SelectionCommand => {
  switch (preference) {
    case 'msb':
      return { _tag: 'PreferMsb' }
    case 'docker':
      return { _tag: 'PreferDocker', probes: recordsFromProbes(probes), first: firstLiveOrUndefined(probes) }
    case 'auto':
      return {
        _tag: 'PreferAuto',
        probes: recordsFromProbes(probes),
        first: firstLiveOrUndefined(probes),
        msbSupported,
      }
  }
}

/** The highest-priority live probe — probes arrive in candidate order, so the first live one IS the winner. */
const firstLiveOrUndefined = (probes: ReadonlyArray<SocketProbeVerdict>): SocketProbeVerdict | undefined =>
  probes.find((probe) => probe.live) ?? undefined

/**
 * `layerAuto` — resolve `RIGHTSIZE_BACKEND` from config, probe the sockets,
 * decide, and yield the `Selection` service or a typed failure. The backend
 * Layers that consume the selection land in their owning units; this is the
 * selection seam, complete and composable on its own.
 */
export const layerAuto = (options: AutoSelectionOptions = {}): Layer.Layer<
  Selection,
  BackendUnreachableError | UnsupportedDockerHostError,
  RightsizeConfig | RuntimeDiscovery
> =>
  Layer.effect(
    Selection,
    Effect.gen(function*() {
      const config = yield* RightsizeConfig
      const discovery = yield* RuntimeDiscovery
      const probes = yield* discovery.probe()
      const command = toCommand(config.backend, probes, options.msbSupported ?? false)
      const decision = decideSelection(command)
      if (Result.isSuccess(decision)) {
        return selectionFromDecision(decision.success)
      }
      return yield* decision.failure
    }),
  )
