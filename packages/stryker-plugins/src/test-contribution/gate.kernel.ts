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

const isRunConfig = (value: unknown): boolean => value === undefined || isRecord(value)

export const parseMutationReport = (value: unknown): MutationReportView | undefined => {
  if (!isRecord(value)) return undefined
  if (!isSourceFileMap(value['files'])) return undefined
  const testFiles = value['testFiles'] ?? {}
  if (!isTestFileMap(testFiles)) return undefined
  const projectRoot = value['projectRoot']
  if (projectRoot !== undefined && typeof projectRoot !== 'string') return undefined
  const config = value['config']
  if (!isRunConfig(config)) return undefined
  const disableBail = isRecord(config) ? config['disableBail'] : undefined
  if (disableBail !== undefined && typeof disableBail !== 'boolean') return undefined
  return {
    files: value['files'],
    testFiles,
    ...(typeof projectRoot === 'string' ? { projectRoot } : {}),
    ...(disableBail === undefined ? {} : { config: { disableBail } }),
  }
}

export interface FileStamp {
  readonly path: string
  readonly modifiedAt: number
}

/**
 * The report is a recording, not a measurement of the tree in front of us. Any file the run
 * covered that changed afterwards makes the recording describe code that no longer exists.
 */
export const filesNewerThanReport = (
  reportModifiedAt: number,
  files: ReadonlyArray<FileStamp>,
): ReadonlyArray<string> => files.filter((file) => file.modifiedAt > reportModifiedAt).map((file) => file.path).sort()

export const filesMissingFromDisk = (
  reported: ReadonlyArray<string>,
  onDisk: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const present = new Set(onDisk)
  return reported.filter((file) => !present.has(file)).sort()
}

export interface GateInput {
  readonly verdict: TestContributionVerdict | undefined
  readonly reportFile: string
  readonly staleFiles?: ReadonlyArray<string>
  readonly foreignRoot?: string
  readonly scopeRequested?: boolean
  readonly vanishedFiles?: ReadonlyArray<string>
}

export const decideGate = (input: GateInput): GateDecision => {
  const { reportFile, verdict } = input
  if (verdict === undefined) {
    return {
      ok: false,
      message:
        `test-contribution: no usable mutation report at ${reportFile}. Run the package's mutation gate first - a run that dies before reporting leaves nothing to measure.`,
    }
  }
  if (input.foreignRoot !== undefined) {
    return {
      ok: false,
      message:
        `test-contribution: ${reportFile} was written for ${input.foreignRoot}, not for the package being checked. A report copied or restored from elsewhere describes another tree.`,
    }
  }
  const staleFiles = input.staleFiles ?? []
  if (staleFiles.length > 0) {
    const listed = staleFiles.map((fileName) => `  - ${fileName}`).join('\n')
    return {
      ok: false,
      message:
        `test-contribution: ${reportFile} is older than ${staleFiles.length} file(s) it claims to describe, so its verdict is about code that has since changed. Re-run the package's mutation gate:\n${listed}`,
    }
  }
  const vanishedFiles = input.vanishedFiles ?? []
  if (vanishedFiles.length > 0) {
    const listed = vanishedFiles.map((fileName) => `  - ${fileName}`).join('\n')
    return {
      ok: false,
      message:
        `test-contribution: ${reportFile} credits ${vanishedFiles.length} test file(s) that no longer exist, so its verdict describes a tree that has since changed. Re-run the package's mutation gate:\n${listed}`,
    }
  }
  if (verdict.attributedKills === 0) {
    return {
      ok: false,
      message:
        `test-contribution: ${reportFile} attributes no kill to any test, so contribution cannot be measured and no file can be cleared. Fix the mutation run before reading this gate (${verdict.unattributableKills} kill(s) recorded no killing test).`,
    }
  }
  if (verdict.inScopeCount === 0) {
    return input.scopeRequested === true
      ? {
        ok: false,
        message:
          `test-contribution: the requested suffix matches no test file in this package, so nothing was measured and a pass would be vacuous. Check the --suffix argument against ${reportFile}.`,
      }
      : {
        ok: true,
        message: 'test-contribution: nothing to measure - this package has no in-scope test file.',
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
