import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Exit, Match } from 'effect'

import { Conformance } from '@systemfsoftware/conformance-spec'
import type { LockCommand } from './lock.model.js'

export type LockOperation = Conformance.Operation<LockCommand, boolean | void>

export type RecordingRun = Kernel.RunResult<ReadonlyArray<LockOperation>, never>

const exitValueOf = (exit: Exit.Exit<ReadonlyArray<LockOperation>, never>): ReadonlyArray<LockOperation> => {
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error('expected the recorded history to come back, not an interrupted exit')
}

export const operationsOfRun = (run: RecordingRun): ReadonlyArray<LockOperation> => {
  if ('exit' in run) return exitValueOf(run.exit)
  throw new Error('expected the recording program to complete, not to fail the run')
}

export interface OperationAnswer extends LockOperation {}

export const answeredOperation = (answer: OperationAnswer): LockOperation => answer

const described = <C, R>(report: Conformance.Report<C, R>): string => {
  try {
    return Conformance.render(report)
  } catch {
    return JSON.stringify(report)
  }
}

export const failReportOf = <C, R>(report: Conformance.Report<C, R>): Conformance.Fail<C, R> =>
  Match.value(report).pipe(
    Match.tag('Fail', (failed) => failed),
    Match.orElse(() => {
      throw new Error(`expected the check to fail, got a report that reads: ${described(report)}`)
    }),
  )

export const passReportOf = <C, R>(report: Conformance.Report<C, R>): Conformance.Pass =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed),
    Match.orElse(() => {
      throw new Error('expected the check to pass, got a report that did not pass')
    }),
  )
