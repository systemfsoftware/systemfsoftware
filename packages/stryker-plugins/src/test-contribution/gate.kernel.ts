import type {
  MutationReportView,
  SourceFileView,
  TestContributionVerdict,
  TestFileView,
} from './contribution.kernel.js'

export interface GateDecision {
  readonly ok: boolean
  readonly message: string
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSourceFile = (value: unknown): value is SourceFileView =>
  isRecord(value) && Array.isArray(value['mutants']) && value['mutants'].every(isRecord)

const isTestFile = (value: unknown): value is TestFileView =>
  isRecord(value) && Array.isArray(value['tests']) &&
  value['tests'].every((test) => isRecord(test) && typeof test['id'] === 'string')

const isSourceFileMap = (value: unknown): value is Readonly<Record<string, SourceFileView>> =>
  isRecord(value) && Object.values(value).every(isSourceFile)

const isTestFileMap = (value: unknown): value is Readonly<Record<string, TestFileView>> =>
  isRecord(value) && Object.values(value).every(isTestFile)

export const parseMutationReport = (value: unknown): MutationReportView | undefined => {
  if (!isRecord(value)) return undefined
  if (!isSourceFileMap(value['files'])) return undefined
  const testFiles = value['testFiles'] ?? {}
  if (!isTestFileMap(testFiles)) return undefined
  return { files: value['files'], testFiles }
}

export const decideGate = (
  verdict: TestContributionVerdict | undefined,
  reportFile: string,
): GateDecision => {
  if (verdict === undefined) {
    return {
      ok: false,
      message:
        `test-contribution: no usable mutation report at ${reportFile}. Run the package's mutation gate first - a run that dies before reporting leaves nothing to measure.`,
    }
  }
  if (verdict.attributedKills === 0) {
    return {
      ok: false,
      message:
        `test-contribution: ${reportFile} attributes no kill to any test, so contribution cannot be measured and no file can be cleared. Fix the mutation run before reading this gate (${verdict.unattributableKills} kill(s) recorded no killing test).`,
    }
  }
  const precision = verdict.disableBail
    ? 'every killing test was recorded'
    : 'the run bailed at the first killing test, so only files that killed nothing are provable'
  if (verdict.toothless.length > 0) {
    const listed = verdict.toothless.map((fileName) => `  - ${fileName}`).join('\n')
    return {
      ok: false,
      message:
        `test-contribution: deleting these ${verdict.toothless.length} test file(s) would leave every mutant just as dead (${precision}):\n${listed}`,
    }
  }
  return {
    ok: true,
    message:
      `test-contribution: every in-scope test file kills a mutant nothing else kills (${precision}; ${verdict.unattributableKills} kill(s) unattributable).`,
  }
}
