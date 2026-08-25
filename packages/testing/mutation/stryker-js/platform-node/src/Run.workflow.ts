import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class PrepareError extends S.TaggedError<PrepareError>()('PrepareError', {
  stage: S.Literal('prepare'),
  reason: S.String,
}) {}

export class PrepareCommand extends S.TaggedClass<PrepareCommand>()('PrepareCommand', {
  fileCount: S.Finite,
  pluginCount: S.Finite,
}) {}

export class PrepareDecision extends S.TaggedClass<PrepareDecision>()('PrepareDecision', {
  fileCount: S.Finite,
}) {}

export const prepareWorkflow = Workflow.make(
  PrepareCommand,
  (command: PrepareCommand): Result.Result<PrepareDecision, PrepareError> => {
    if (command.fileCount === 0) {
      return Result.fail(new PrepareError({ stage: 'prepare', reason: 'No input files found.' }))
    }
    return Result.succeed(new PrepareDecision({ fileCount: command.fileCount }))
  },
)

export { DryRunCommand, DryRunDecision, DryRunError, dryRunWorkflow } from './DryRun.workflow.js'
export { InstrumentCommand, InstrumentDecision, InstrumentError, instrumentWorkflow } from './Instrument.workflow.js'
