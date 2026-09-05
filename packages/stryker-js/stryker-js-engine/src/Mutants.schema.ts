import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

const DiffChangesSchema = S.Struct({ added: S.Finite, removed: S.Finite })
const DiffStatisticsSchema = S.Struct({
  changesByFile: S.Record(S.String, DiffChangesSchema),
  total: DiffChangesSchema,
})

const PositionSchema = S.Struct({ line: S.Finite, column: S.Finite })
const PreviousLocationSchema = S.Struct({ start: PositionSchema, end: PositionSchema })

const PreviousMutantSchema = S.Struct({
  mutatorName: S.String,
  replacement: S.String,
  location: PreviousLocationSchema,
  status: S.String,
  testsCompleted: S.optional(S.Finite),
  coveredBy: S.optional(S.Array(S.String)),
  killedBy: S.optional(S.Array(S.String)),
})

const PreviousFileSchema = S.Struct({
  source: S.optional(S.String),
  mutants: S.optional(S.Array(PreviousMutantSchema)),
})

const PreviousTestFileSchema = S.Struct({
  source: S.optional(S.String),
})

const RememberedMutantSchema = S.Struct({
  mutantId: S.String,
  status: S.String,
  testsCompleted: S.optional(S.Finite),
  coveredBy: S.optional(S.Array(S.String)),
  killedBy: S.optional(S.Array(S.String)),
})

export const PreviousFilesSchema = S.Record(S.String, PreviousFileSchema)
export const PreviousTestFilesSchema = S.Record(S.String, PreviousTestFileSchema)

export class IncrementalDiffCommand extends S.TaggedClass<IncrementalDiffCommand>()('IncrementalDiffCommand', {
  basePath: S.String,
  currentMutants: S.Array(Mutant),
  previousFiles: PreviousFilesSchema,
  previousTestFiles: PreviousTestFilesSchema,
  currentRelativeFiles: S.Record(S.String, S.String),
  testIdsByRelativeFile: S.Record(S.String, S.Array(S.String)),
  coveringTestFilesByMutantId: S.Record(S.String, S.Array(S.String)),
  force: S.Boolean,
}) {}

export class IncrementalDiffDecision extends S.TaggedClass<IncrementalDiffDecision>()('IncrementalDiffDecision', {
  mutants: S.Array(Mutant),
  remembered: S.Array(RememberedMutantSchema),
  mutantStatistics: DiffStatisticsSchema,
  testStatistics: DiffStatisticsSchema,
}) {}

export type PreviousFile = S.Schema.Type<typeof PreviousFileSchema>
export type PreviousTestFile = S.Schema.Type<typeof PreviousTestFileSchema>
export type PreviousMutant = S.Schema.Type<typeof PreviousMutantSchema>
export type RememberedMutant = S.Schema.Type<typeof RememberedMutantSchema>

const PlannerOptionsSchema = S.Struct({
  disableBail: S.Boolean,
  timeoutMS: S.Finite,
  timeoutFactor: S.Finite,
  ignoreStatic: S.Boolean,
})

export class PlanMutantTestsCommand extends S.TaggedClass<PlanMutantTestsCommand>()('PlanMutantTestsCommand', {
  mutants: S.Array(Mutant),
  timeOverheadMS: S.Finite,
  timeSpentAllTests: S.Finite,
  globalTestFilter: S.optional(S.Array(S.String)),
  hitsByMutantId: S.Record(S.String, S.Finite),
  staticCoverage: S.optional(S.Record(S.String, S.Finite)),
  testsByMutantId: S.Record(S.String, S.Array(S.String)),
  testTimeById: S.Record(S.String, S.Finite),
  options: PlannerOptionsSchema,
  sandboxFileByName: S.Record(S.String, S.String),
}) {}

const DecidedRunOptionsSchema = S.Struct({
  mutantActivation: S.Literals(['runtime', 'static']),
  timeout: S.Finite,
  sandboxFileName: S.String,
  disableBail: S.Boolean,
  reloadEnvironment: S.Boolean,
  testFilter: S.optionalKey(S.Array(S.String)),
  hitLimit: S.optionalKey(S.Finite),
})

const RunPlanSchema = S.Struct({
  plan: S.Literal('Run'),
  mutantId: S.String,
  netTime: S.Finite,
  runOptions: DecidedRunOptionsSchema,
  static: S.optional(S.Boolean),
  coveredBy: S.optional(S.Array(S.String)),
})

const EarlyResultPlanSchema = S.Struct({
  plan: S.Literal('EarlyResult'),
  mutantId: S.String,
  status: S.Literals([
    'Killed',
    'Survived',
    'NoCoverage',
    'Timeout',
    'CompileError',
    'RuntimeError',
    'Ignored',
    'Pending',
  ]),
  statusReason: S.optional(S.String),
  static: S.optional(S.Boolean),
  coveredBy: S.optional(S.Array(S.String)),
})

const TestPlanSchema = S.Union([EarlyResultPlanSchema, RunPlanSchema])

export class PlannedMutantTests extends S.TaggedClass<PlannedMutantTests>()('PlannedMutantTests', {
  plans: S.Array(TestPlanSchema),
  totalNetTime: S.Finite,
}) {}
