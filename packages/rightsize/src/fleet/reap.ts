/**
 * The explicit reaper — `reap()`, the idempotent sweep over the hygiene
 * ledger (R6, R15) authored as a `Cell` description: read the ledger →
 * decide the kill set → write the kills.
 *
 * The decision is the same one the automatic reaper's startup sweep makes,
 * exposed as a callable surface: every OTHER run's record is judged
 * against its pid + start time (the same-pid-reuse guard), and the runs
 * whose owner is gone — plus stale unparseable records beyond the
 * mid-write freshness cutoff — are reaped through the backend's kill
 * commands. Alive runs, this run, and runs on the OTHER backend (a docker
 * process never removes an msb sandbox and vice versa) are left alone.
 *
 * `decideReap` is the pure half: gathered facts in, kill set out, one
 * exhaustive dispatch. The write phase re-reads each doomed run's ledger
 * entries FRESH — a racing sweep may already have deleted them, and the
 * kill set degrades to nothing, so a double reap is a no-op — kills
 * through the stop/remove/remove-network prefixes (the same argv the
 * watchdog child runs), and deletes the run's ledger files.
 *
 * Foreign-container safety: the ledger only ever names containers this
 * library created (rz-… run-scoped names), so the sweep's kill argv is
 * exactly the ledger's names — a non-rightsize container on the host is
 * structurally unreachable from this sweep.
 */
import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Result, Schema as S } from 'effect'
import { pipe } from 'effect/Function'

import {
  deleteRunFiles,
  dockerKillCommands,
  isRecordAlive,
  listRunIds,
  msbKillCommands,
  parseRunRecord,
  type ProcessTimeSource,
  readLedgerEntries,
  readRunRecordRaw,
  realProcessTimeSource,
  type ReaperKillCommands,
  type RunRecord,
  spawnSyncKill,
  UNPARSEABLE_FRESH_AGE_MS,
} from '../lifecycle/hygiene/ledger.js'
import { BackendError } from '../model/errors.js'
import { RightsizeConfig } from '../runtime/config.js'
import type { RightsizeConfigService } from '../runtime/config.js'
import { RunId } from '../runtime/run-id.js'
import type { BackendName } from '../runtime/runtime.js'
import { Selection } from '../runtime/selection.workflow.js'
import { cacheDirFromConfig, msbBinaryFor } from './handle.js'

// =============================================================================
// The decision — which runs to reap
// =============================================================================

/** One other run's judged facts — gathered at read time, decided below. */
export interface ReapRunFacts {
  readonly runId: string
  /** The parsed run record, or `undefined` when missing/unparseable. */
  readonly record: RunRecord | undefined
  /** Record missing AND the file younger than the fresh-age cutoff — presumed mid-write by its owner, not corrupt. */
  readonly unparseableFresh: boolean
  /** The owner pid is alive with a matching start time (meaningful only when `record` is set). */
  readonly alive: boolean
}

/** The recorded facts the reaper decision runs on — observed data, no service reads. */
export type ReapCommand = {
  readonly _tag: 'Reap'
  /** This process's own run id — always skipped. */
  readonly thisRunId: string
  /** The backend this process acts on — other-backend runs are left alone. */
  readonly backend: BackendName
  /** Every OTHER run's judged facts. */
  readonly runs: ReadonlyArray<ReapRunFacts>
}

/** Nothing was judged reaper-worthy. */
export class ReapSkipped extends S.TaggedClass<ReapSkipped>()('ReapSkipped', {}) {}

/** The kill set: the run ids to reap, in ledger order. */
export class ReapRuns extends S.TaggedClass<ReapRuns>()('ReapRuns', {
  runs: S.Array(S.Struct({ runId: S.String })),
}) {}

/** The closed decision space of the reap workflow. */
export type ReapDecision = ReapSkipped | ReapRuns

/**
 * The gather lied: a command that contradicts its own facts (this run's id
 * present among the judged runs, or a run marked fresh-mid-write while
 * carrying a parsed record) — a caller bug, refused rather than planned
 * over, mirroring teardown's contradiction channel.
 */
export class ReapFactContradictionError extends S.TaggedError<ReapFactContradictionError>()(
  'ReapFactContradictionError',
  { message: S.String },
) {}

/** The kernel: which runs are dead on this backend, in ledger order. Pure — the judges ran at gather time. */
const decideReapKernel = (
  command: ReapCommand,
): Result.Result<ReapDecision, ReapFactContradictionError> => {
  const self = command.runs.find((run) => run.runId === command.thisRunId)
  if (self !== undefined) {
    return Result.fail(
      ReapFactContradictionError.make({
        message: `reap command includes this process's own run '${command.thisRunId}' — the gather must exclude it`,
      }),
    )
  }
  const contradiction = command.runs.find((run) => run.record !== undefined && run.unparseableFresh)
  if (contradiction !== undefined) {
    return Result.fail(
      ReapFactContradictionError.make({
        message:
          `run '${contradiction.runId}' carries a parsed record AND the fresh-mid-write mark — mutually exclusive`,
      }),
    )
  }
  const targets = command.runs
    .filter((run) => run.runId !== command.thisRunId)
    .filter((run) => {
      if (run.record === undefined) {
        return !run.unparseableFresh
      }
      if (run.record.backend !== command.backend) {
        return false
      }
      return !run.alive
    })
    .map((run) => ({ runId: run.runId }))
  return Result.succeed(targets.length === 0 ? ReapSkipped.make({}) : ReapRuns.make({ runs: targets }))
}

/**
 * The one reap decision, at the `Workflow.make` boundary — the sweep's
 * kill-set selection. The body is a single call into the kernel; the error
 * channel exists for one defect class: a command whose gathered facts
 * contradict themselves.
 */
export const decideReap = Workflow.make(
  (command: ReapCommand): Result.Result<ReapDecision, ReapFactContradictionError> => decideReapKernel(command),
)

// =============================================================================
// The reap cell — read ledger → decide kill set → write kills
// =============================================================================

/** The gathered facts: every other run's judged record, in scan order. */
interface ReapGathered {
  readonly runs: ReadonlyArray<ReapRunFacts>
}

/** The kill runner + liveness seams the sweep runs on (all injectable). */
export interface ReapDeps {
  readonly cacheDir: string
  readonly thisRunId: string
  readonly kill: ReaperKillCommands
  /** The command runner seam; defaults to `spawnSyncKill`. */
  readonly runKill?: ((argv: ReadonlyArray<string>) => void) | undefined
  /** The liveness source; defaults to `realProcessTimeSource`. */
  readonly timeSource?: ProcessTimeSource | undefined
  /** The «now» clock for the unparseable-fresh rule; defaults to `Date.now`. */
  readonly now?: (() => number) | undefined
}

/** One run's judged facts, resolved from its record file (or its absence). */
const gatherOneRun = (deps: ReapDeps, runId: string): Promise<ReapRunFacts> => {
  const now = deps.now ?? Date.now
  return readRunRecordRaw(deps.cacheDir, runId).then((record) => {
    if (record === undefined) {
      return { runId, record: undefined, unparseableFresh: false, alive: false }
    }
    const parsed = parseRunRecord(record.text)
    if (parsed === undefined) {
      const ageMs = now() - record.mtimeMs
      return { runId, record: undefined, unparseableFresh: ageMs <= UNPARSEABLE_FRESH_AGE_MS, alive: false }
    }
    const source = deps.timeSource ?? realProcessTimeSource
    return isRecordAlive(source, parsed.pid, parsed.startedIso).then((alive) => ({
      runId,
      record: parsed,
      unparseableFresh: false,
      alive,
    }))
  })
}

/** Gathers every other run's record + liveness — all judged facts, no decision inside. */
const gatherReapFacts = (deps: ReapDeps): Effect.Effect<ReapGathered> =>
  Effect.promise(() =>
    listRunIds(deps.cacheDir).then((runIds) => {
      const others = runIds.filter((runId) => runId !== deps.thisRunId)
      return Promise.all(others.map((runId) => gatherOneRun(deps, runId))).then((runs) => ({ runs }))
    })
  )

const distillReap = (raw: ReapGathered, deps: ReapDeps): ReapCommand => ({
  _tag: 'Reap',
  thisRunId: deps.thisRunId,
  backend: deps.kill.backend,
  runs: raw.runs,
})

/** The cell's channels — the sweep has no service context: every seam is in `deps`. */
interface ReapPhases extends Cell.Phases {
  readonly command: { readonly cacheDir: string }
  readonly raw: ReapGathered
  readonly decoded: ReapCommand
  readonly decision: ReapDecision
  readonly decisionError: ReapFactContradictionError
  readonly output: Result.Result<ReapDecision, ReapFactContradictionError>
  readonly response: void
  readonly decodeError: never
  readonly readError: never
  readonly writeError: ReapFactContradictionError
  readonly readContext: never
  readonly writeContext: never
}

/** One dead run's kill pass: fresh entries → prefixed kills → run files deleted. Never rejects. */
const reapOneRun = (deps: ReapDeps, runId: string): Promise<void> =>
  readLedgerEntries(deps.cacheDir, runId).then((entries) => {
    const runKill = deps.runKill ?? spawnSyncKill
    for (const entry of entries) {
      if (entry.kind === 'sandbox') {
        runKill([...deps.kill.stop, entry.name])
        runKill([...deps.kill.remove, entry.name])
      } else {
        runKill([...deps.kill.removeNetwork, entry.id])
      }
    }
    return deleteRunFiles(deps.cacheDir, runId)
  })

const writeReap = (
  outcome: Result.Result<ReapDecision, ReapFactContradictionError>,
  deps: ReapDeps,
): Effect.Effect<void, ReapFactContradictionError> =>
  Result.match(outcome, {
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('ReapSkipped', () => Effect.void),
        Match.tag('ReapRuns', (planned) =>
          Effect.promise(() => Promise.all(planned.runs.map((run) => reapOneRun(deps, run.runId)))).pipe(
            Effect.as(undefined),
          )),
        Match.exhaustive,
      ),
    onFailure: (contradiction) =>
      Effect.fail(contradiction),
  })

/**
 * The reap description — one layer that plans the kill set and executes it.
 * Built per invocation: the write phase closes over the resolved deps, the
 * same way the teardown description closes over its state.
 */
const reapDescription = (deps: ReapDeps) =>
  pipe(
    Cell.read<ReapPhases>(() => gatherReapFacts(deps)),
    Cell.decode<ReapPhases>((raw) => Result.succeed(distillReap(raw, deps))),
    Cell.decide<ReapPhases>(decideReap),
    Cell.encode<ReapPhases>((outcome) => outcome),
    Cell.write<ReapPhases>((outcome) => writeReap(outcome, deps)),
  )

// =============================================================================
// The public surface
// =============================================================================

/** The sweep knobs — every optional default matches the automatic reaper's resolution. */
export interface ReapOptions {
  /** The cache dir the ledger lives under (default: from `RightsizeConfig`/platform). */
  readonly cacheDir?: string | undefined
  /** The kill command prefixes (default: this backend's — docker `rm -f`; msb stop+rm over the resolved binary). */
  readonly kill?: ReaperKillCommands | undefined
  /** The command runner seam; defaults to `spawnSyncKill`. */
  readonly runKill?: ((argv: ReadonlyArray<string>) => void) | undefined
  /** The liveness source; defaults to `realProcessTimeSource`. */
  readonly timeSource?: ProcessTimeSource | undefined
  /** The «now» clock for the unparseable-fresh rule; defaults to `Date.now`. */
  readonly now?: (() => number) | undefined
}

/**
 * One explicit reap pass — idempotent, best-effort per run, never touching
 * a live run or another backend's. Fails with `BackendError` only when the
 * msb kill command set cannot be resolved (no binary); the kills
 * themselves never fail the call (a racing sweep's removal is a no-op).
 */
export const reap = (
  options: ReapOptions = {},
): Effect.Effect<void, BackendError | ReapFactContradictionError, Selection | RightsizeConfig> =>
  Effect.gen(function*() {
    const selection = yield* Selection
    const config = yield* RightsizeConfig
    const cacheDir = options.cacheDir ?? cacheDirFromConfig(config)
    const kill = options.kill ?? resolveKillFor(selection.backend, config, cacheDir)
    if (kill === undefined) {
      return yield* BackendError.make({
        message:
          'reap cannot resolve the msb kill commands: no msb binary (MSB_PATH unset or unusable, and no pinned install under the cache)',
      })
    }
    return yield* Cell.apply(
      reapDescription({
        cacheDir,
        thisRunId: RunId.value,
        kill,
        runKill: options.runKill,
        timeSource: options.timeSource,
        now: options.now,
      }),
      { cacheDir },
    )
  })

/** The backend's kill command set, or `undefined` when the msb binary cannot be resolved. */
const resolveKillFor = (
  backend: BackendName,
  config: RightsizeConfigService,
  cacheDir: string,
): ReaperKillCommands | undefined => {
  if (backend === 'docker') {
    return dockerKillCommands()
  }
  const binary = msbBinaryFor(config, cacheDir)
  return binary === undefined ? undefined : msbKillCommands(binary)
}
