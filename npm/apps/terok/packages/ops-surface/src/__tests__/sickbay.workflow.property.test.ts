import { it } from '@effect/vitest'
import { Either, Schema as S } from 'effect'

import {
  CheckFinding,
  CheckFixable,
  CheckOk,
  CheckResult,
  CheckWarning,
  ReportRow,
  ScopeHostWide,
  ScopeProject,
  ScopeTask,
  SickbayCommand,
  TaskScopedCheck,
} from '../diagnostic.schema.js'
import { decideSickbay, SystemWithScope } from '../sickbay.workflow.js'

const rowEq = (a: ReportRow, b: ReportRow): boolean =>
  a.label === b.label && a.marker === b.marker && a.detail === b.detail

const rowsEq = (a: readonly ReportRow[], b: readonly ReportRow[]): boolean =>
  a.length === b.length && a.every((row, index) => b[index] !== undefined && rowEq(row, b[index]))

const taskResultsOf = (command: SickbayCommand): readonly TaskScopedCheck[] => {
  const scope = command.scope
  if (S.is(ScopeHostWide)(scope)) return command.taskScoped
  if (S.is(ScopeProject)(scope)) return command.taskScoped.filter((task) => task.project === scope.project)
  if (S.is(ScopeTask)(scope)) {
    return command.taskScoped.filter((task) => task.project === scope.project && task.taskId === scope.taskId)
  }
  return []
}

const selectedResultsOf = (command: SickbayCommand): readonly CheckResult[] => {
  if (command.system) return command.hostWide
  const scope = command.scope
  if (S.is(ScopeTask)(scope)) return taskResultsOf(command).map((task) => task.result)
  return [...command.hostWide, ...taskResultsOf(command).map((task) => task.result)]
}

/** OPS-SURFACE-06: `--system` with a project or task scope is refused, never silently dropped. */
it.prop('∀c_SickbaySystemScope_⊥Scope', [SickbayCommand], ([command]) => {
  const outcome = decideSickbay(command)
  const refused = command.system && !S.is(ScopeHostWide)(command.scope)
  return refused
    ? Either.isLeft(outcome) && S.is(SystemWithScope)(outcome.left)
    : Either.isRight(outcome)
})

/** OPS-SURFACE-08/-09/-10: the exit code is the worst severity over the results in scope. */
it.prop('∀c_SickbayExitCode_=WorstRank', [SickbayCommand], ([command]) => {
  const outcome = decideSickbay(command)
  if (Either.isLeft(outcome)) return true
  const rankOf = (result: CheckResult): number =>
    S.is(CheckFinding)(result) ? 2 : S.is(CheckWarning)(result) || S.is(CheckFixable)(result) ? 1 : 0
  const worst = selectedResultsOf(command).reduce((acc, result) => Math.max(acc, rankOf(result)), 0)
  return outcome.right.exitCode === worst
})

/** OPS-SURFACE-04/-11: `--fix` remediates the displayed rows but never changes the exit code. */
it.prop('∀c_SickbayFix_=ExitUnchanged', [SickbayCommand], ([command]) => {
  const withoutFix = decideSickbay({ ...command, fix: false })
  const withFix = decideSickbay({ ...command, fix: true })
  if (Either.isLeft(withoutFix) || Either.isLeft(withFix)) {
    return Either.isLeft(withoutFix) === Either.isLeft(withFix)
  }
  return withoutFix.right.exitCode === withFix.right.exitCode
})

/** OPS-SURFACE-03: a task scope skips host-wide checks and appends the `ok (consistent)` row exactly when every task check passed. */
it.prop('∀c_SickbayTaskScope_⊆Consistent', [SickbayCommand], ([command]) => {
  const scope = command.scope
  if (!S.is(ScopeTask)(scope)) return true
  const outcome = decideSickbay(command)
  if (Either.isLeft(outcome)) return true
  const allPass = taskResultsOf(command).every(
    (task) => S.is(CheckOk)(task.result) || (S.is(CheckFixable)(task.result) && command.fix),
  )
  const expected = allPass
    ? [{ label: `Task ${scope.project}/${scope.taskId}`, marker: 'ok' as const, detail: 'consistent' }]
    : []
  const consistent = outcome.right.rows.filter((row) => row.detail === 'consistent')
  const noHostRows = outcome.right.rows.every((row) => row.label.startsWith('Task '))
  return rowsEq(consistent, expected) && noHostRows
})

/** OPS-SURFACE-02: a project scope walks exactly that project's tasks. */
it.prop('∀c_SickbayProjectScope_⊆Project', [SickbayCommand], ([command]) => {
  if (!S.is(ScopeProject)(command.scope)) return true
  const outcome = decideSickbay(command)
  if (Either.isLeft(outcome)) return true
  const project = command.scope.project
  const expected = taskResultsOf(command).length
  const taskRows = outcome.right.rows.filter((row) => row.label.startsWith('Task '))
  const allInProject = taskRows.every((row) => row.label.startsWith(`Task ${project}/`))
  return taskRows.length === expected && allInProject
})

/** OPS-SURFACE-05: `--system` reports host-wide rows only, never a task walk. */
it.prop('∀c_SickbaySystem_⊆HostOnly', [SickbayCommand], ([command]) => {
  if (!command.system) return true
  if (!S.is(ScopeHostWide)(command.scope)) return true
  const outcome = decideSickbay(command)
  if (Either.isLeft(outcome)) return false
  return outcome.right.rows.length === command.hostWide.length
})

/** OPS-SURFACE-04/-07: every row mirrors its check result; `--fix` stamps fixables `ok` with the remediation detail. */
it.prop('∀f_SickbayFix_=Remediated', [S.Array(CheckResult), S.Boolean], ([results, fix]) => {
  const command: SickbayCommand = {
    scope: new ScopeHostWide(),
    system: false,
    fix,
    hostWide: results,
    taskScoped: [],
  }
  const outcome = decideSickbay(command)
  if (Either.isLeft(outcome)) return false
  const expected = results.map((result) => {
    if (S.is(CheckOk)(result)) return { label: result.name, marker: 'ok' as const, detail: result.detail }
    if (S.is(CheckWarning)(result)) return { label: result.name, marker: 'WARN' as const, detail: result.detail }
    if (S.is(CheckFinding)(result)) return { label: result.name, marker: 'ERROR' as const, detail: result.detail }
    return {
      label: result.name,
      marker: fix ? ('ok' as const) : ('WARN' as const),
      detail: fix ? result.remediation : result.detail,
    }
  })
  return rowsEq(outcome.right.rows, expected)
})
