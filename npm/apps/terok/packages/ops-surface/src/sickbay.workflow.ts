import * as A from 'effect/Array'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import {
  CheckOk,
  CheckResult,
  ExitCode,
  ReportRow,
  Scope,
  SickbayCommand,
  TaskScopedCheck,
} from './diagnostic.schema.js'

const SickbayTypeId: unique symbol = Symbol.for('@terok/ops-surface/Sickbay')
type SickbayTypeId = typeof SickbayTypeId

/**
 * The sickbay decision: the aggregated report — the rows in display order and
 * the exit code. The exit code is derived from the ORIGINAL severities of the
 * results in scope, so `--fix` remediates the displayed rows without changing
 * the exit code (OPS-SURFACE-04, -11).
 */
export class SickbayReport extends S.TaggedClass<SickbayReport>()('SickbayReport', {
  scope: Scope,
  rows: S.Array(ReportRow),
  exitCode: ExitCode,
}) {
  readonly [SickbayTypeId] = SickbayTypeId
}

/** Refusal: `--system` with a project or task scope (OPS-SURFACE-06). */
export class SystemWithScope extends S.TaggedError<SystemWithScope>()('SystemWithScope', {}) {
  readonly [SickbayTypeId] = SickbayTypeId
}

const isHostWide = (scope: Scope): boolean =>
  Match.value(scope).pipe(
    Match.when({ _tag: 'HostWide' }, () => true),
    Match.orElse(() => false),
  )

const taskResults = (command: SickbayCommand): readonly TaskScopedCheck[] =>
  Match.value(command.scope).pipe(
    Match.when({ _tag: 'HostWide' }, () => command.taskScoped),
    Match.when({ _tag: 'Project' }, (scope) => A.filter(command.taskScoped, (task) => task.project === scope.project)),
    Match.when({ _tag: 'Task' }, (scope) =>
      A.filter(command.taskScoped, (task) => task.project === scope.project && task.taskId === scope.taskId)),
    Match.orElse(() => []),
  )

const hostResults = (command: SickbayCommand): readonly CheckResult[] =>
  Match.value(command.scope).pipe(
    Match.when({ _tag: 'Task' }, () => []),
    Match.orElse(() => command.hostWide),
  )

/** The results the run actually reports on: never host-wide for a task scope, never the task walk under `--system`. */
const selectedResults = (command: SickbayCommand): readonly CheckResult[] =>
  Match.value(command.system).pipe(
    Match.when(true, () => command.hostWide),
    Match.when(false, () => A.appendAll(hostResults(command), A.map(taskResults(command), (task) => task.result))),
    Match.exhaustive,
  )

/** `--fix` turns a fixable finding into the outcome `remediation` describes; everything else is untouched. */
const remediated = (result: CheckResult, fix: boolean): CheckResult =>
  Match.value(result).pipe(
    Match.when({ _tag: 'Fixable' }, (fixable): CheckResult =>
      Match.value(fix).pipe(
        Match.when(true, (): CheckResult => new CheckOk({ name: fixable.name, detail: fixable.remediation })),
        Match.when(false, (): CheckResult => fixable),
        Match.exhaustive,
      )),
    Match.orElse((): CheckResult => result),
  )

const rowFor = (label: string, result: CheckResult): ReportRow =>
  Match.value(result).pipe(
    Match.when({ _tag: 'Ok' }, (ok): ReportRow => ({ label, marker: 'ok', detail: ok.detail })),
    Match.when({ _tag: 'Warning' }, (warning): ReportRow => ({ label, marker: 'WARN', detail: warning.detail })),
    Match.when({ _tag: 'Finding' }, (finding): ReportRow => ({ label, marker: 'ERROR', detail: finding.detail })),
    Match.when({ _tag: 'Fixable' }, (fixable): ReportRow => ({ label, marker: 'WARN', detail: fixable.detail })),
    Match.orElse((): ReportRow => ({ label, marker: 'ERROR', detail: '' })),
  )

const hostRows = (command: SickbayCommand): readonly ReportRow[] =>
  A.map(hostResults(command), (result) => rowFor(result.name, remediated(result, command.fix)))

const taskRows = (command: SickbayCommand): readonly ReportRow[] =>
  Match.value(command.system).pipe(
    Match.when(true, (): readonly ReportRow[] => []),
    Match.when(false, (): readonly ReportRow[] =>
      A.flatMap(taskResults(command), (task) => [
        rowFor(`Task ${task.project}/${task.taskId} ${task.result.name}`, remediated(task.result, command.fix)),
      ])),
    Match.exhaustive,
  )

const finalIsOk = (result: CheckResult, fix: boolean): boolean =>
  Match.value(remediated(result, fix)).pipe(
    Match.when({ _tag: 'Ok' }, () => true),
    Match.orElse(() => false),
  )

/** The trailing `Task <p>/<t>   ok (consistent)` row — appended only for a task scope whose every check passed (OPS-SURFACE-03). */
const consistencyRows = (command: SickbayCommand): readonly ReportRow[] =>
  Match.value(command.scope).pipe(
    Match.when({ _tag: 'Task' }, (scope): readonly ReportRow[] =>
      Match.value(A.every(taskResults(command), (task) =>
        finalIsOk(task.result, command.fix))).pipe(
          Match.when(true, (): readonly ReportRow[] => [
            { label: `Task ${scope.project}/${scope.taskId}`, marker: 'ok', detail: 'consistent' },
          ]),
          Match.when(false, (): readonly ReportRow[] => []),
          Match.exhaustive,
        )),
    Match.orElse((): readonly ReportRow[] => []),
  )

const rankOf = (result: CheckResult): number =>
  Match.value(result).pipe(
    Match.when({ _tag: 'Ok' }, (): number => 0),
    Match.when({ _tag: 'Warning' }, (): number => 1),
    Match.when({ _tag: 'Fixable' }, (): number => 1),
    Match.when({ _tag: 'Finding' }, (): number => 2),
    Match.orElse((): number => 2),
  )

const hasRank = (results: readonly CheckResult[], rank: number): boolean =>
  A.some(results, (result) => rankOf(result) === rank)

/** 0 = all ok, 1 = at least one warning and no error, 2 = at least one error (OPS-SURFACE-08/-09/-10). */
const exitCodeOf = (results: readonly CheckResult[]): ExitCode =>
  Match.value(hasRank(results, 2)).pipe(
    Match.when(true, (): ExitCode => 2),
    Match.when(false, (): ExitCode =>
      Match.value(hasRank(results, 1)).pipe(
        Match.when(true, (): ExitCode => 1),
        Match.when(false, (): ExitCode => 0),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const buildReport = (command: SickbayCommand): SickbayReport =>
  new SickbayReport({
    scope: command.scope,
    rows: A.appendAll(A.appendAll(hostRows(command), taskRows(command)), consistencyRows(command)),
    exitCode: exitCodeOf(selectedResults(command)),
  })

export const decideSickbay = (command: SickbayCommand): Either<SickbayReport, SystemWithScope> =>
  Match.value(command.system && !isHostWide(command.scope)).pipe(
    Match.when(true, () => left(new SystemWithScope())),
    Match.when(false, () => right(buildReport(command))),
    Match.exhaustive,
  )
