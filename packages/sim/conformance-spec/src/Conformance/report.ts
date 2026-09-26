/**
 * The report every check returns (R10): the shrunk schedule, each fiber's
 * operations with their observed responses, and which judgement broke —
 * no sequential order explains the history, the model diverged at a step,
 * or an interruption at a step left the resource held.
 */
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Formatter, Match } from 'effect'

import type { Operation } from './history.js'

/** Which judgement broke, in the words R10 names for each check. */
export type Problem =
  | 'no-sequential-order'
  | 'model-diverged'
  | 'interruption-left-held'
  | 'stop-rule-broken'
  | 'stop-never-finished'
  | 'waited-forever'
  | 'left-running-after-stop'
  | 'restart-never-finished'
  | 'restart-left-running'
  | 'reached-real-system'

/** The judgements only the stop check reports (R6, R8). */
export type StopProblem = Extract<
  Problem,
  | 'stop-rule-broken'
  | 'stop-never-finished'
  | 'waited-forever'
  | 'left-running-after-stop'
  | 'restart-never-finished'
  | 'restart-left-running'
  | 'reached-real-system'
>

/** Which stop the check applied when it judged, or that it applied none. */
export type StopCut = 'uncut' | 'told-to-stop' | 'one-fiber-stopped' | 'killed'

export type CheckKind = 'linearizable' | 'sequential' | 'stop'

/** The stop judgements, in the words R8 names each one. */
const stopCutText: Readonly<Record<StopCut, string>> = {
  uncut: 'without any cut',
  'told-to-stop': 'told to stop',
  'one-fiber-stopped': 'one fiber stopped',
  killed: 'killed',
}

/** The judgement a failing run reports, with the step it broke at when one applies. */
export interface Judgement {
  readonly problem: Problem
  readonly step: number | undefined
  /** The stop cut the judgement came from, when the stop check judged one. */
  readonly cut?: StopCut
  /** The unit's broken rule or the kernel outcome, in plain words. */
  readonly detail?: string
}

/** The sequential-order judgement: no sequential order explains the history. */
export const noSequentialOrder: Judgement = { problem: 'no-sequential-order', step: undefined }

/** The model judgement: the model diverged from the implementation at a step. */
export const modelDivergedAt = (step: number): Judgement => ({ problem: 'model-diverged', step })

/** The release judgement: an interruption at a step left the resource held. */
export const interruptionLeftHeldAt = (step: number): Judgement => ({ problem: 'interruption-left-held', step })

/** A failed run's evidence, as the check observed it. */
export interface Failure<C, R> {
  readonly judgement: Judgement
  /** The schedule the shrunk run took, as one decision per explored step. */
  readonly schedule: ReadonlyArray<Kernel.Decision>
  /** How many deviations from Effect's order the shrunk schedule still pays for. */
  readonly deviations: number
  readonly operations: ReadonlyArray<Operation<C, R>>
  readonly bound: Kernel.Bound
  readonly otherCutJudgements?: ReadonlyArray<Judgement>
  readonly passedOver?: number
  readonly unit?: string
}

/** A run that never produced a history to judge. */
export interface Incomplete {
  readonly failure: Kernel.RunFailure | undefined
  readonly schedule: ReadonlyArray<Kernel.Decision>
  readonly bound: Kernel.Bound
  /** Why the stop check had nothing to judge, when it ran none. */
  readonly stopNote?: string
}

const PassTag = { _tag: 'Pass' } as const
const FailTag = { _tag: 'Fail' } as const
const IncompleteTag = { _tag: 'Incomplete' } as const
const OverBudgetTag = { _tag: 'OverBudget' } as const

type PassTag = typeof PassTag
type FailTag = typeof FailTag
type IncompleteTag = typeof IncompleteTag
type OverBudgetTag = typeof OverBudgetTag

export interface Pass extends PassTag {
  readonly bound: Kernel.Bound
  /** The check's own history count: explored schedules, or stop cut points tried. */
  readonly histories: number
  readonly check: CheckKind
  readonly passedOver?: number
  readonly unit?: string
}

export interface Fail<C, R> extends FailTag {
  readonly failure: Failure<C, R>
}

export interface IncompleteReport extends IncompleteTag {
  readonly incomplete: Incomplete
}

export interface OverBudget extends OverBudgetTag {
  readonly bound: Kernel.Bound
}

/** The outcome of one check, at the bound it explored. */
export type Report<C, R> = Pass | Fail<C, R> | IncompleteReport | OverBudget

const boundText = (bound: Kernel.Bound): string =>
  `${bound.fibers} fibers, ${bound.operations} operations, ${bound.preemptions} preemptions, ` +
  `${bound.runs} runs, pruning ${bound.pruning.enabled ? 'on' : 'off'}`

const PROBLEM_TEXT: Readonly<Record<Problem, string>> = {
  'no-sequential-order': 'no sequential order explains this history',
  'model-diverged': 'the model diverged',
  'interruption-left-held': 'an interruption left the resource held',
  'stop-rule-broken': 'the stop rule is broken',
  'stop-never-finished': 'stop never finished',
  'waited-forever': 'waited forever',
  'left-running-after-stop': 'left running after stop',
  'restart-never-finished': 'the restart never finished',
  'restart-left-running': 'the restart left work running',
  'reached-real-system': 'a real outside call was reached',
}

const HEADLINE_TEXT: Readonly<Record<Problem, string>> = {
  'no-sequential-order': 'linearizability failed',
  'model-diverged': 'the model diverged',
  'interruption-left-held': 'the release failed',
  'stop-rule-broken': 'the stop rule is broken',
  'stop-never-finished': 'the stop never finished',
  'waited-forever': 'the stop left a waiter waiting',
  'left-running-after-stop': 'the stop left work running',
  'restart-never-finished': 'the restart never finished',
  'restart-left-running': 'the restart left work running',
  'reached-real-system': 'the stop reached the real system',
}

const describedText = (judgement: Judgement): string => judgement.detail ?? PROBLEM_TEXT[judgement.problem]

const atStepText = (step: number | undefined): string => (step === undefined ? '' : ` at step ${step}`)

const plainText = (described: string, at: string): string => `${described}${at}`

const cutText = (cut: StopCut, at: string, described: string): string => `${stopCutText[cut]}${at}: ${described}`

const judgementText = (judgement: Judgement): string => {
  const described = describedText(judgement)
  const at = atStepText(judgement.step)
  return judgement.cut === undefined ? plainText(described, at) : cutText(judgement.cut, at, described)
}

const scheduleText = (schedule: ReadonlyArray<Kernel.Decision>): string =>
  `shrunk schedule [${schedule.join(', ')}] (${schedule.length} decisions)`

const operationText = <C, R>(operation: Operation<C, R>): string =>
  `fiber ${operation.worker}: ${Formatter.format(operation.command)} -> ` +
  `${operation.answered === undefined ? 'never answered' : Formatter.format(operation.response)}`

const suspendedText = (suspended: Kernel.SuspendedFiber): string =>
  `fiber ${suspended.id} suspended in: ${suspended.frames.join(' <- ')}`

const deadlockText = (deadlock: Kernel.DeadlockFailure): string =>
  [
    `the run deadlocked with ${deadlock.suspended.length} fibers suspended`,
    ...deadlock.suspended.map(suspendedText),
  ].join('\n')

export const runFailureText = (failure: Kernel.RunFailure): string =>
  Match.value(failure).pipe(
    Match.tag('Escape', (escape) => `the run escaped to the ${escape.timer} timer at ${escape.site}`),
    Match.tag('Blocked', (blocked) => `the run blocked on ${blocked.on}`),
    Match.tag('Deadlock', deadlockText),
    Match.tag('Runaway', (runaway) => `the run passed ${runaway.steps} steps with work still pending`),
    Match.exhaustive,
  )

const uncompletedText = (failure: Kernel.RunFailure | undefined): string =>
  failure === undefined ? 'the run exited without recording a history' : runFailureText(failure)

const unitPrefix = (unit: string | undefined): string => (unit === undefined ? '' : `${unit}: `)

const passedOverText = (passedOver: number | undefined): string => `${passedOver ?? 0} one-fiber point(s) passed over`

const stopPassText = (report: Pass): string =>
  `${unitPrefix(report.unit)}every stop cut passed, ${report.histories} tried, ` +
  `${passedOverText(report.passedOver)}: ${boundText(report.bound)}`

const passText = (report: Pass): string =>
  report.check === 'stop'
    ? stopPassText(report)
    : `the history matches a sequential order of the model, over ${report.histories} explored schedules: ` +
      `${boundText(report.bound)}`

const otherCutText = (judgements: ReadonlyArray<Judgement> | undefined): ReadonlyArray<string> =>
  judgements === undefined ? [] : judgements.map(judgementText)

const stopCoverageText = <C, R>(failed: Fail<C, R>): ReadonlyArray<string> =>
  failed.failure.judgement.cut === undefined ? [] : [passedOverText(failed.failure.passedOver)]

const failText = <C, R>(failed: Fail<C, R>): string =>
  [
    `${unitPrefix(failed.failure.unit)}${HEADLINE_TEXT[failed.failure.judgement.problem]}`,
    judgementText(failed.failure.judgement),
    ...otherCutText(failed.failure.otherCutJudgements),
    scheduleText(failed.failure.schedule),
    `${failed.failure.deviations} deviation(s) from Effect's order`,
    ...failed.failure.operations.map(operationText),
    ...stopCoverageText(failed),
    `bound: ${boundText(failed.failure.bound)}`,
  ].join('\n')

const incompleteText = (incomplete: IncompleteReport): string =>
  [
    incomplete.incomplete.stopNote === undefined
      ? 'the run never produced a history to judge'
      : `the unit was not checked: ${incomplete.incomplete.stopNote}`,
    uncompletedText(incomplete.incomplete.failure),
    scheduleText(incomplete.incomplete.schedule),
    `bound: ${boundText(incomplete.incomplete.bound)}`,
  ].join('\n')

/** The report a consumer reads or a test asserts on, as text. */
export const render = <C, R>(report: Report<C, R>): string =>
  Match.value(report).pipe(
    Match.tag('Pass', passText),
    Match.tag('Fail', failText),
    Match.tag('Incomplete', incompleteText),
    Match.tag('OverBudget', (overBudget) =>
      `the search exhausted its schedule budget before covering every schedule: ${boundText(overBudget.bound)}`),
    Match.exhaustive,
  )
