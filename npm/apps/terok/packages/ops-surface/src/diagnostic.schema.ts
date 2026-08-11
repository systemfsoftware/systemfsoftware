import { Schema as S } from 'effect'

/**
 * Domain declarations for the terok operations surface (`sickbay`, `panic`).
 *
 * Check results are declared as a tagged union of what each result IS — a
 * check that passed (`Ok`), one that passed with a caveat (`Warning`), one
 * that found a real problem (`Finding`), and one that found a problem the
 * `--fix` flag can remediate (`Fixable`). The tags deliberately never say
 * `Error`/`Failed`: the severity vocabulary is `ok` / `warning` / `error`,
 * and an error is a severity, not a result kind.
 */

/** Display identity of a sickbay check — the label the row is stamped with (e.g. `Shield`, `Vault`, `post_stop hook`). */
export const CheckName = S.String.pipe(S.brand('CheckName'))
export type CheckName = S.Schema.Type<typeof CheckName>

/** A project reference (`myproj`). */
export const ProjectName = S.String.pipe(S.brand('ProjectName'))
export type ProjectName = S.Schema.Type<typeof ProjectName>

/** A task identifier (`k3v8h`). A task-scoped run may be addressed by a partial prefix; resolution is the caller's job. */
export const TaskId = S.String.pipe(S.brand('TaskId'))
export type TaskId = S.Schema.Type<typeof TaskId>

/** A container reference, e.g. `<project>-<mode>-<task_id>`. */
export const ContainerName = S.String.pipe(S.brand('ContainerName'))
export type ContainerName = S.Schema.Type<typeof ContainerName>

/** Worst-severity vocabulary a check result contributes to the run. */
export const CheckStatus = S.Literal('ok', 'warning', 'error')
export type CheckStatus = S.Schema.Type<typeof CheckStatus>

/** The aligned marker a rendered row is stamped with (OPS-SURFACE-07). */
export const Marker = S.Literal('ok', 'WARN', 'ERROR')
export type Marker = S.Schema.Type<typeof Marker>

/**
 * Sickbay exit codes (OPS-SURFACE-08/-09/-10): 0 = every check passed,
 * 1 = at least one warning and no error, 2 = at least one error.
 */
export const ExitCode = S.Literal(0, 1, 2)
export type ExitCode = S.Schema.Type<typeof ExitCode>

/** A check that passed. */
export class CheckOk extends S.TaggedClass<CheckOk>()('Ok', {
  name: CheckName,
  detail: S.String,
}) {}

/** A check that passed with a caveat — contributes severity `warning`. */
export class CheckWarning extends S.TaggedClass<CheckWarning>()('Warning', {
  name: CheckName,
  detail: S.String,
}) {}

/** A check that found a real problem — contributes severity `error`. */
export class CheckFinding extends S.TaggedClass<CheckFinding>()('Finding', {
  name: CheckName,
  detail: S.String,
}) {}

/**
 * A check that found a problem `--fix` can remediate (e.g. a missed
 * `post_stop` hook, OPS-SURFACE-04) — contributes severity `warning`; with
 * `--fix` the row is stamped `ok` with `remediation` as its detail.
 */
export class CheckFixable extends S.TaggedClass<CheckFixable>()('Fixable', {
  name: CheckName,
  detail: S.String,
  remediation: S.String,
}) {}

export const CheckResult = S.Union(CheckOk, CheckWarning, CheckFinding, CheckFixable)
export type CheckResult = S.Schema.Type<typeof CheckResult>

/** Host-wide run — every project's tasks are walked (OPS-SURFACE-01). */
export class ScopeHostWide extends S.TaggedClass<ScopeHostWide>()('HostWide', {}) {}

/** The per-container walk is scoped to exactly one project (OPS-SURFACE-02). */
export class ScopeProject extends S.TaggedClass<ScopeProject>()('Project', {
  project: ProjectName,
}) {}

/** The run is scoped to a single task; host-wide checks are skipped (OPS-SURFACE-03). */
export class ScopeTask extends S.TaggedClass<ScopeTask>()('Task', {
  project: ProjectName,
  taskId: TaskId,
}) {}

export const Scope = S.Union(ScopeHostWide, ScopeProject, ScopeTask)
export type Scope = S.Schema.Type<typeof Scope>

/** One line of a sickbay report — render-ready, marker already stamped. */
export const ReportRow = S.Struct({
  label: S.String,
  marker: Marker,
  detail: S.String,
})
export type ReportRow = S.Schema.Type<typeof ReportRow>

/**
 * The panic report's shields line: a raised count, or BYPASSED when the
 * firewall-protection bypass is configured (OPS-SURFACE-28).
 */
export const ShieldsLine = S.Union(
  S.Struct({ kind: S.Literal('raised'), count: S.Int.pipe(S.greaterThanOrEqualTo(0)) }),
  S.Struct({ kind: S.Literal('bypassed') }),
)
export type ShieldsLine = S.Schema.Type<typeof ShieldsLine>

/**
 * The panic report data. The `Containers killed` line exists only when
 * containers were stopped; the vault passphrase is always destroyed
 * (OPS-SURFACE-22/-23).
 */
export const PanicReport = S.Struct({
  found: S.Int.pipe(S.greaterThanOrEqualTo(0)),
  shields: ShieldsLine,
  supervisorsKilled: S.Int.pipe(S.greaterThanOrEqualTo(0)),
  vault: S.Literal('destroyed'),
  containersKilled: S.optional(S.Struct({ count: S.Int.pipe(S.greaterThanOrEqualTo(0)) })),
})
export type PanicReport = S.Schema.Type<typeof PanicReport>

/** A check result observed for one task of one project. */
export const TaskScopedCheck = S.Struct({
  project: ProjectName,
  taskId: TaskId,
  result: CheckResult,
})
export type TaskScopedCheck = S.Schema.Type<typeof TaskScopedCheck>

/**
 * The `terok sickbay` command: the scope plus the observed check results.
 * Host-wide results and per-task results arrive partitioned — the runner
 * decides which checks to execute; the workflow aggregates them.
 */
export const SickbayCommand = S.Struct({
  scope: Scope,
  /** `--system` — host-wide checks only; refused with a project/task scope (OPS-SURFACE-05/-06). */
  system: S.Boolean,
  /** `--fix` — auto-remediate fixable findings without changing the exit code (OPS-SURFACE-04/-11). */
  fix: S.Boolean,
  hostWide: S.Array(CheckResult),
  taskScoped: S.Array(TaskScopedCheck),
})
export type SickbayCommand = S.Schema.Type<typeof SickbayCommand>

/**
 * The `terok panic` command. `confirmed` records the answer to the
 * `Also kill all containers? [y/N]` prompt (OPS-SURFACE-24); with `--stop` no
 * prompt happens and a recorded decline contradicts the kill request.
 */
export const PanicCommand = S.Struct({
  action: S.Literal('panic', 'clear'),
  /** `--stop` — kill containers without prompting (OPS-SURFACE-25); ignored when clearing (OPS-SURFACE-30). */
  stop: S.Boolean,
  confirmed: S.Boolean,
  /** `shield.bypass_firewall_no_protection` — the report shows BYPASSED instead of a raised count (OPS-SURFACE-28). */
  bypassFirewall: S.Boolean,
  /** Whether the panic lock is currently present — decides the `--clear` outcome (OPS-SURFACE-29). */
  panicked: S.Boolean,
  containers: S.Array(ContainerName),
})
export type PanicCommand = S.Schema.Type<typeof PanicCommand>
