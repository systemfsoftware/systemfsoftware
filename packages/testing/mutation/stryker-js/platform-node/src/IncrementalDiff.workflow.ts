import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const DiffChangesSchema = S.Struct({ added: S.Finite, removed: S.Finite })
const DiffStatisticsSchema = S.Struct({
  changesByFile: S.Record(S.String, DiffChangesSchema),
  total: DiffChangesSchema,
})

export class IncrementalDiffCommand extends S.TaggedClass<IncrementalDiffCommand>()('IncrementalDiffCommand', {
  basePath: S.String,
  fileDescriptions: S.Record(S.String, S.Unknown),
  currentMutants: S.Array(Mutant),
  incrementalReport: S.Unknown,
  currentRelativeFiles: S.Record(S.String, S.String),
  testCoverage: S.Unknown,
  force: S.Boolean,
}) {}

export class IncrementalDiffDecision extends S.TaggedClass<IncrementalDiffDecision>()('IncrementalDiffDecision', {
  mutants: S.Array(Mutant),
  mutantStatistics: DiffStatisticsSchema,
  testStatistics: DiffStatisticsSchema,
  testCoverage: S.Unknown,
}) {}

export class IncrementalDiffError extends S.TaggedError<IncrementalDiffError>()('IncrementalDiffError', {
  message: S.String,
}) {}

const decideIncremental = (
  command: IncrementalDiffCommand,
): Result.Result<IncrementalDiffDecision, IncrementalDiffError> =>
  Result.succeed(
    IncrementalDiffDecision.make({
      mutants: [...command.currentMutants],
      mutantStatistics: { changesByFile: {}, total: { added: 0, removed: 0 } },
      testStatistics: { changesByFile: {}, total: { added: 0, removed: 0 } },
      testCoverage: command.testCoverage,
    }),
  )

export const incrementalDifferWorkflow = Workflow.make(IncrementalDiffCommand, (command) => decideIncremental(command))
