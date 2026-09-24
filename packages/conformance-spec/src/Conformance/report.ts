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
export type Problem = 'no-sequential-order' | 'model-diverged' | 'interruption-left-held'

/** The judgement a failing run reports, with the step it broke at when one applies. */
export interface Judgement {
  readonly problem: Problem
  readonly step: number | undefined
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
}

/** A run that never produced a history to judge. */
export interface Incomplete {
  readonly failure: Kernel.RunFailure | undefined
  readonly schedule: ReadonlyArray<Kernel.Decision>
  readonly bound: Kernel.Bound
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
  readonly histories: number
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
}

const HEADLINE_TEXT: Readonly<Record<Problem, string>> = {
  'no-sequential-order': 'linearizability failed',
  'model-diverged': 'the model diverged',
  'interruption-left-held': 'the release failed',
}

const judgementText = (judgement: Judgement): string => {
  const problem = PROBLEM_TEXT[judgement.problem]
  return judgement.step === undefined ? problem : `${problem} at step ${judgement.step}`
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

const failureText = (failure: Kernel.RunFailure): string =>
  Match.value(failure).pipe(
    Match.tag('Escape', (escape) => `the run escaped to the ${escape.timer} timer at ${escape.site}`),
    Match.tag('Blocked', (blocked) => `the run blocked on ${blocked.on}`),
    Match.tag('Deadlock', deadlockText),
    Match.tag('Runaway', (runaway) => `the run passed ${runaway.steps} steps with work still pending`),
    Match.exhaustive,
  )

const uncompletedText = (failure: Kernel.RunFailure | undefined): string =>
  failure === undefined ? 'the run exited without recording a history' : failureText(failure)

const passText = (report: Pass): string =>
  `the history matches a sequential order of the model, over ${report.histories} explored schedules: ` +
  `${boundText(report.bound)}`

/** The report a consumer reads or a test asserts on, as text. */
export const render = <C, R>(report: Report<C, R>): string =>
  Match.value(report).pipe(
    Match.tag('Pass', passText),
    Match.tag('Fail', (failed) =>
      [
        HEADLINE_TEXT[failed.failure.judgement.problem],
        judgementText(failed.failure.judgement),
        scheduleText(failed.failure.schedule),
        `${failed.failure.deviations} deviation(s) from Effect's order`,
        ...failed.failure.operations.map(operationText),
        `bound: ${boundText(failed.failure.bound)}`,
      ].join('\n')),
    Match.tag('Incomplete', (incomplete) =>
      [
        'the run never produced a history to judge',
        uncompletedText(incomplete.incomplete.failure),
        scheduleText(incomplete.incomplete.schedule),
        `bound: ${boundText(incomplete.incomplete.bound)}`,
      ].join('\n')),
    Match.tag('OverBudget', (overBudget) =>
      `the search exhausted its schedule budget before covering every schedule: ${boundText(overBudget.bound)}`),
    Match.exhaustive,
  )
