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

export class InstrumentDecision extends S.TaggedClass<InstrumentDecision>()('InstrumentDecision', {
  workingDirectoryHint: S.String,
  backupDirectoryHint: S.String,
  fileCount: S.Finite,
}) {}

export const instrumentWorkflow = Workflow.make(
  InstrumentCommand,
  (command: InstrumentCommand): Result.Result<InstrumentDecision, InstrumentError> => {
    if (command.fileCount === 0) {
      return Result.fail(new InstrumentError({ stage: 'instrument', reason: 'No files to instrument.' }))
    }
    return Match.value(command.inPlace).pipe(
      Match.when(true, () =>
        Result.succeed(
          new InstrumentDecision({
            workingDirectoryHint: 'inPlace',
            backupDirectoryHint: 'backup',
            fileCount: command.fileCount,
          }),
        )),
      Match.when(false, () =>
        Result.succeed(
          new InstrumentDecision({
            workingDirectoryHint: 'temp',
            backupDirectoryHint: '',
            fileCount: command.fileCount,
          }),
        )),
      Match.exhaustive,
    )
  },
)
