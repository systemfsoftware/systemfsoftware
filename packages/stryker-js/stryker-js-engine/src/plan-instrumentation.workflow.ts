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

const toInstrumentKind = (command: InstrumentCommand): 'Invalid' | 'InPlace' | 'Ephemeral' => {
  if (command.fileCount === 0) {
    return 'Invalid'
  }
  if (command.inPlace) {
    return 'InPlace'
  }
  return 'Ephemeral'
}

export const planInstrumentation = Workflow.make(
  InstrumentCommand,
  (command: InstrumentCommand): Result.Result<InstrumentDecision, InstrumentError> =>
    Match.value(toInstrumentKind(command)).pipe(
      Match.when(
        'Invalid',
        () => Result.fail(new InstrumentError({ stage: 'instrument', reason: 'No files to instrument.' })),
      ),
      Match.when('InPlace', () =>
        Result.succeed(
          new InPlaceInstrument({
            workingDirectoryHint: 'inPlace',
            backupDirectoryHint: 'backup',
            fileCount: command.fileCount,
          }),
        )),
      Match.when('Ephemeral', () =>
        Result.succeed(
          new EphemeralInstrument({
            workingDirectoryHint: 'temp',
            fileCount: command.fileCount,
          }),
        )),
      Match.exhaustive,
    ),
)
