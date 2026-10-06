import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  CommitThenResetFault,
  FaultCommand,
  FaultHidden,
  FaultInject,
  FaultProceed,
  FaultReset,
  FaultVerdict,
  InjectedStatusFault,
  OperationFault,
  VisibilityWindowFault,
} from './faults.schema.js'

const replaceFault = (
  faults: ReadonlyArray<OperationFault>,
  fault: OperationFault,
  next: OperationFault,
): ReadonlyArray<OperationFault> =>
  Array.map(faults, (candidate) =>
    Match.value(candidate === fault).pipe(
      Match.when(true, () => next),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const dropFault = (faults: ReadonlyArray<OperationFault>, fault: OperationFault): ReadonlyArray<OperationFault> =>
  Array.filter(faults, (candidate) => candidate !== fault)

const consumeInjected = (
  faults: ReadonlyArray<OperationFault>,
  fault: InjectedStatusFault,
): ReadonlyArray<OperationFault> => {
  const next = InjectedStatusFault.make({
    operation: fault.operation,
    status: fault.status,
    retryAfterSeconds: fault.retryAfterSeconds,
    remaining: fault.remaining - 1,
  })
  return Match.value(next.remaining <= 0).pipe(
    Match.when(true, () => dropFault(faults, fault)),
    Match.when(false, () => replaceFault(faults, fault, next)),
    Match.exhaustive,
  )
}

const consumeReset = (
  faults: ReadonlyArray<OperationFault>,
  fault: CommitThenResetFault,
): ReadonlyArray<OperationFault> => {
  const next = CommitThenResetFault.make({ operation: fault.operation, remaining: fault.remaining - 1 })
  return Match.value(next.remaining <= 0).pipe(
    Match.when(true, () => dropFault(faults, fault)),
    Match.when(false, () => replaceFault(faults, fault, next)),
    Match.exhaustive,
  )
}

const consumeRead = (
  faults: ReadonlyArray<OperationFault>,
  fault: VisibilityWindowFault,
): ReadonlyArray<OperationFault> => {
  const next = VisibilityWindowFault.make({ operation: fault.operation, remainingReads: fault.remainingReads - 1 })
  return Match.value(next.remainingReads <= 0).pipe(
    Match.when(true, () => dropFault(faults, fault)),
    Match.when(false, () => replaceFault(faults, fault, next)),
    Match.exhaustive,
  )
}

const verdictFor = (faults: ReadonlyArray<OperationFault>, isWrite: boolean) => (fault: OperationFault): FaultVerdict =>
  Match.value(fault).pipe(
    Match.tag('InjectedStatusFault', (injected) =>
      Match.value(injected.remaining > 0).pipe(
        Match.when(true, () =>
          FaultInject.make({
            faults: consumeInjected(faults, injected),
            status: injected.status,
            retryAfterSeconds: injected.retryAfterSeconds,
          })),
        Match.when(false, () => FaultProceed.make({ faults })),
        Match.exhaustive,
      )),
    Match.tag('CommitThenResetFault', (reset) =>
      Match.value(isWrite).pipe(
        Match.when(true, () => FaultReset.make({ faults: consumeReset(faults, reset) })),
        Match.when(false, () => FaultProceed.make({ faults })),
        Match.exhaustive,
      )),
    Match.tag('VisibilityWindowFault', (window) =>
      Match.value(isWrite).pipe(
        Match.when(true, () => FaultProceed.make({ faults })),
        Match.when(false, () =>
          Match.value(window.remainingReads > 0).pipe(
            Match.when(true, () => FaultHidden.make({ faults: consumeRead(faults, window) })),
            Match.when(false, () => FaultProceed.make({ faults })),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const decide = (command: FaultCommand): Result.Result<FaultVerdict, never> =>
  Result.succeed(
    Option.match(Array.findFirst(command.faults, (fault) => fault.operation === command.operation), {
      onNone: () => FaultProceed.make({ faults: command.faults }),
      onSome: verdictFor(command.faults, command.isWrite),
    }),
  )

export const judgeFault = Workflow.make({
  command: FaultCommand,
  decision: FaultVerdict,
  error: Schema.Never,
  decide,
})
