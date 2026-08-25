import * as S from 'effect/Schema'

export const DryRunStatus = S.Literals(['complete', 'error', 'timeout'])
export type DryRunStatus = typeof DryRunStatus.Type

export const TestStatus = S.Literals(['success', 'failed', 'skipped'])
export type TestStatus = typeof TestStatus.Type

export const MutantRunStatus = S.Literals(['killed', 'survived', 'timeout', 'error'])
export type MutantRunStatus = typeof MutantRunStatus.Type

export class TestRunnerFailed extends S.TaggedError<TestRunnerFailed>()('TestRunnerFailed', {
  cause: S.String,
  phase: S.Literals(['capabilities', 'dispose', 'dryRun', 'init', 'mutantRun']),
  runnerName: S.String,
}) {}
