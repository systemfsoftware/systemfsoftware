import * as S from 'effect/Schema'

import { Mutant, PositionSchema } from './Mutant.schema.js'

export const DryRunStatus = S.Literals(['complete', 'error', 'timeout'])
export type DryRunStatus = typeof DryRunStatus.Type

export const TestStatus = S.Literals(['success', 'failed', 'skipped'])
export type TestStatus = typeof TestStatus.Type

export const MutantRunStatus = S.Literals(['killed', 'survived', 'timeout', 'error'])
export type MutantRunStatus = typeof MutantRunStatus.Type

const TestResultBase = {
  id: S.String,
  name: S.String,
  timeSpentMs: S.Finite,
  fileName: S.optionalKey(S.String),
  startPosition: S.optionalKey(PositionSchema),
}

export const TestResultSchema = S.Union([
  S.Struct({ ...TestResultBase, status: S.Literal('failed'), failureMessage: S.String }),
  S.Struct({ ...TestResultBase, status: S.Literal('skipped') }),
  S.Struct({ ...TestResultBase, status: S.Literal('success') }),
])

export const MutantCoverageSchema = S.Struct({
  perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
  static: S.Record(S.String, S.Finite),
})

export const DryRunResultSchema = S.Union([
  S.Struct({
    status: S.Literal('complete'),
    tests: S.Array(TestResultSchema),
    mutantCoverage: S.optionalKey(MutantCoverageSchema),
  }),
  S.Struct({ status: S.Literal('timeout'), reason: S.optionalKey(S.String) }),
  S.Struct({ status: S.Literal('error'), errorMessage: S.String }),
])

export const MutantRunResultSchema = S.Union([
  S.Struct({
    status: S.Literal('killed'),
    killedBy: S.Array(S.String),
    failureMessage: S.String,
    nrOfTests: S.Finite,
  }),
  S.Struct({ status: S.Literal('survived'), nrOfTests: S.Finite }),
  S.Struct({ status: S.Literal('timeout'), reason: S.optionalKey(S.String) }),
  S.Struct({ status: S.Literal('error'), errorMessage: S.String }),
])

export const CoverageAnalysisSchema = S.Literals(['off', 'all', 'perTest'])

const RunOptionsFields = {
  timeout: S.Finite,
  disableBail: S.Boolean,
}

export const DryRunOptionsSchema = S.Struct({
  ...RunOptionsFields,
  coverageAnalysis: CoverageAnalysisSchema,
  files: S.optionalKey(S.Array(S.String)),
  testFiles: S.optionalKey(S.Array(S.String)),
})

export const MutantActivationSchema = S.Literals(['runtime', 'static'])

export const MutantRunOptionsSchema = S.Struct({
  ...RunOptionsFields,
  activeMutant: Mutant,
  sandboxFileName: S.String,
  mutantActivation: MutantActivationSchema,
  reloadEnvironment: S.Boolean,
  testFilter: S.optionalKey(S.Array(S.String)),
  hitLimit: S.optionalKey(S.Finite),
})

export const TestRunnerCapabilitiesSchema = S.Struct({
  reloadEnvironment: S.Boolean,
})

export class TestRunnerFailed extends S.TaggedError<TestRunnerFailed>()('TestRunnerFailed', {
  cause: S.String,
  phase: S.Literals(['capabilities', 'dispose', 'dryRun', 'init', 'mutantRun']),
  runnerName: S.String,
}) {}
