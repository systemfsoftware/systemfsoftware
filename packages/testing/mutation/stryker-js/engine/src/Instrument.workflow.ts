import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class InstrumentError extends S.TaggedError<InstrumentError>()('InstrumentError', {
  stage: S.Literal('instrument'),
  reason: S.String,
}) {}

export class InstrumentCommand extends S.TaggedClass<InstrumentCommand>()('InstrumentCommand', {
  fileCount: S.Finite,
  inPlace: S.Boolean,
  pluginCount: S.Finite,
}) {}

const InstrumentDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/InstrumentDecision')
type InstrumentDecisionTypeId = typeof InstrumentDecisionTypeId

export class InPlaceInstrument extends S.TaggedClass<InPlaceInstrument>()('InPlaceInstrument', {
  workingDirectoryHint: S.String,
  backupDirectoryHint: S.String,
  fileCount: S.Finite,
}) {
  readonly [InstrumentDecisionTypeId] = InstrumentDecisionTypeId
}

export class EphemeralInstrument extends S.TaggedClass<EphemeralInstrument>()('EphemeralInstrument', {
  workingDirectoryHint: S.String,
  fileCount: S.Finite,
}) {
  readonly [InstrumentDecisionTypeId] = InstrumentDecisionTypeId
}

export type InstrumentDecision = InPlaceInstrument | EphemeralInstrument

export const instrumentWorkflow = Workflow.make(
  InstrumentCommand,
  (command: InstrumentCommand): Result.Result<InstrumentDecision, InstrumentError> => {
    if (command.fileCount === 0) {
      return Result.fail(new InstrumentError({ stage: 'instrument', reason: 'No files to instrument.' }))
    }
    return Match.value(command.inPlace).pipe(
      Match.when(true, () =>
        Result.succeed(
          new InPlaceInstrument({
            workingDirectoryHint: 'inPlace',
            backupDirectoryHint: 'backup',
            fileCount: command.fileCount,
          }),
        )),
      Match.when(false, () =>
        Result.succeed(
          new EphemeralInstrument({
            workingDirectoryHint: 'temp',
            fileCount: command.fileCount,
          }),
        )),
      Match.exhaustive,
    )
  },
)
