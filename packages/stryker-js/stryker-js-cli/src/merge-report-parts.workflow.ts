import { Workflow } from '@systemfsoftware/effect-cell-types'
import { MutationTestResultSchema } from '@systemfsoftware/stryker-js/Report'
import type {
  FileResult,
  MutantResult,
  MutationTestResult,
  TestFile,
  Thresholds,
} from '@systemfsoftware/stryker-js/Report'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const MERGED_SCHEMA_VERSION = '1.7'
const DEFAULT_THRESHOLDS = { high: 80, low: 60 }
const FAILING_OUTCOME = 'failure'
const SURVIVOR_STATUSES: Record<string, true> = { Survived: true, NoCoverage: true }

const SCORE_INCOMPLETE = 'incomplete'
const SCORE_ABSENT = 'no report'
const SCORE_UNDEFINED = 'n/a'
const SCORE_PERFECT = '100.00'
const VERDICT_OK = '✅'
const VERDICT_FAIL = '❌'
const VERDICT_WARN = '⚠️'
const ABSENT_CELLS: readonly string[] = ['—', '—', '—', '—', '—']
const ALL_PACKAGES_LABEL = '**all**'

export const ReportPart = S.Struct({
  label: S.String,
  outcome: S.String,
  incomplete: S.Boolean,
  report: S.optional(MutationTestResultSchema),
})

export const MergeVerdictRow = S.Struct({
  label: S.String,
  score: S.String,
  cells: S.Array(S.String),
  verdict: S.String,
})

export const MergeSurvivor = S.Struct({
  file: S.String,
  line: S.Finite,
  column: S.Finite,
  status: S.String,
  mutatorName: S.String,
  replacement: S.String,
})

export class MergeReportPartsCommand extends S.Class<MergeReportPartsCommand>('MergeReportPartsCommand')({
  parts: S.Array(ReportPart),
  expectedPackages: S.optional(S.Array(S.String)),
}) {}

const MergeReportPartsTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/MergeReportParts')
type MergeReportPartsTypeId = typeof MergeReportPartsTypeId

export class MergedReports extends S.TaggedClass<MergedReports>()('MergedReports', {
  report: MutationTestResultSchema,
  rows: S.Array(MergeVerdictRow),
  survivors: S.Array(MergeSurvivor),
}) {
  readonly [MergeReportPartsTypeId] = MergeReportPartsTypeId
}

export class NoMergedReports extends S.TaggedClass<NoMergedReports>()('NoMergedReports', {
  rows: S.Array(MergeVerdictRow),
}) {
  readonly [MergeReportPartsTypeId] = MergeReportPartsTypeId
}

export class DuplicatePackageLabel extends S.TaggedError<DuplicatePackageLabel>()('DuplicatePackageLabel', {
  label: S.String,
}) {}

export class MissingPackages extends S.TaggedError<MissingPackages>()('MissingPackages', {
  packages: S.Array(S.String),
}) {}

type Decision = MergedReports | NoMergedReports
type DecisionError = DuplicatePackageLabel | MissingPackages
type VerdictRow = S.Schema.Type<typeof MergeVerdictRow>
type Survivor = S.Schema.Type<typeof MergeSurvivor>
type ReportPartValue = S.Schema.Type<typeof ReportPart>
type PartWithReport = ReportPartValue & { readonly report: MutationTestResult }

interface Score {
  readonly mutationScore: number
  readonly cells: readonly string[]
}

const thresholdsOf = (part: PartWithReport | undefined): Thresholds => {
  if (part === undefined) {
    return DEFAULT_THRESHOLDS
  }
  return part.report.thresholds
}

const commonProjectRoot = (roots: readonly string[]): string | undefined => {
  if (roots.length === 0) {
    return undefined
  }
  return commonBasePath(roots)
}

const scoreFor = (part: ReportPartValue | undefined): Score | undefined => {
  if (part === undefined || part.report === undefined) {
    return undefined
  }
  return scoreOf(part.report.files)
}

const outcomeOf = (reports: readonly PartWithReport[]): string => {
  if (reports.some((part) => part.outcome === FAILING_OUTCOME)) {
    return FAILING_OUTCOME
  }
  return 'success'
}

const normalizeName = (fileName: string): string => fileName.split(/[/\\]/).filter(Boolean).join('/')

const commonBasePath = (fileNames: readonly string[]): string => {
  const directories = fileNames.map((fileName) => fileName.split(/[/\\]/).slice(0, -1))
  const shared = directories.reduce((previous: readonly string[], current) => {
    const common: string[] = []
    for (const [index, segment] of previous.entries()) {
      if (current[index] !== segment) break
      common.push(segment)
    }
    return common
  }, directories[0] ?? [])
  return shared.join('/')
}

const normalizedNames = <A>(input: Readonly<Record<string, A>>): Readonly<Record<string, A>> => {
  const base = commonBasePath(Object.keys(input))
  return Object.fromEntries(
    Object.entries(input).map(([fileName, value]) => [normalizeName(fileName.slice(base.length)), value]),
  )
}

const uniqueId = (label: string, id: string): string => `${label}_${id}`

const uniqueIds = (label: string, ids: readonly string[] | undefined): readonly string[] | undefined => {
  if (ids === undefined) {
    return undefined
  }
  return ids.map((id) => uniqueId(label, id))
}

const rewrittenMutant = (label: string, mutant: MutantResult): MutantResult => ({
  ...mutant,
  id: uniqueId(label, mutant.id),
  killedBy: uniqueIds(label, mutant.killedBy),
  coveredBy: uniqueIds(label, mutant.coveredBy),
})

const rewrittenFile = (label: string, file: FileResult): FileResult => ({
  ...file,
  mutants: file.mutants.map((mutant) => rewrittenMutant(label, mutant)),
})

const withProjectRoot = (report: MutationTestResult, projectRoot: string | undefined): MutationTestResult => {
  if (projectRoot === undefined) {
    return report
  }
  return { ...report, projectRoot }
}

const mergeParts = (parts: readonly PartWithReport[]): MutationTestResult => {
  const files: Record<string, FileResult> = {}
  const testFiles: Record<string, TestFile> = {}
  const projectRoots: string[] = []
  for (const part of parts) {
    for (const [fileName, file] of Object.entries(normalizedNames(part.report.files))) {
      files[`${part.label}/${fileName}`] = rewrittenFile(part.label, file)
    }
    const partTestFiles = part.report.testFiles
    if (partTestFiles !== undefined) {
      for (const [fileName, testFile] of Object.entries(normalizedNames(partTestFiles))) {
        testFiles[`${part.label}/${fileName}`] = {
          ...testFile,
          tests: testFile.tests.map((test) => ({ ...test, id: uniqueId(part.label, test.id) })),
        }
      }
    }
    if (part.report.projectRoot !== undefined) {
      projectRoots.push(part.report.projectRoot)
    }
  }
  const merged: MutationTestResult = {
    files,
    schemaVersion: MERGED_SCHEMA_VERSION,
    thresholds: thresholdsOf(parts[0]),
    config: {},
  }
  if (Object.keys(testFiles).length > 0) {
    return withProjectRoot({ ...merged, testFiles }, commonProjectRoot(projectRoots))
  }
  return withProjectRoot(merged, commonProjectRoot(projectRoots))
}

const mutationScoreOf = (totalDetected: number, totalValid: number): number => {
  if (totalValid === 0) {
    return Number.NaN
  }
  return (totalDetected / totalValid) * 100
}

const scoreOf = (files: Readonly<Record<string, FileResult>>): Score => {
  const mutants = Object.values(files).flatMap((file) => file.mutants)
  const count = (status: string): number => mutants.filter((mutant) => mutant.status === status).length
  const killed = count('Killed')
  const timeout = count('Timeout')
  const survived = count('Survived')
  const noCoverage = count('NoCoverage')
  const compileErrors = count('CompileError')
  const totalDetected = timeout + killed
  const cells = [String(killed), String(survived), String(noCoverage), String(timeout), String(compileErrors)]
  return { mutationScore: mutationScoreOf(totalDetected, survived + noCoverage + totalDetected), cells }
}

const cellsFor = (score: Score | undefined): readonly string[] => {
  if (score === undefined) {
    return ABSENT_CELLS
  }
  return score.cells
}

const verdictOf = (
  label: string,
  score: Score | undefined,
  outcome: string | undefined,
  incomplete: boolean,
): VerdictRow => {
  const cells = cellsFor(score)
  if (incomplete) {
    if (outcome === 'success') return { label, score: SCORE_INCOMPLETE, cells, verdict: VERDICT_WARN }
    return { label, score: SCORE_INCOMPLETE, cells, verdict: VERDICT_FAIL }
  }
  if (score === undefined) return { label, score: SCORE_ABSENT, cells, verdict: VERDICT_WARN }
  if (Number.isNaN(score.mutationScore)) {
    return { label, score: SCORE_UNDEFINED, cells, verdict: VERDICT_WARN }
  }
  const rendered = score.mutationScore.toFixed(2)
  if (outcome !== 'success') return { label, score: rendered, cells, verdict: VERDICT_FAIL }
  if (score.mutationScore === 100) {
    return { label, score: SCORE_PERFECT, cells, verdict: VERDICT_OK }
  }
  return { label, score: rendered, cells, verdict: VERDICT_FAIL }
}

const firstDuplicateLabel = (parts: readonly ReportPartValue[]): string => {
  const duplicate = parts.find((part, index) => parts.slice(0, index).some((earlier) => earlier.label === part.label))
  if (duplicate === undefined) {
    return ''
  }
  return duplicate.label
}

const uniqueParts = (parts: readonly ReportPartValue[]): readonly ReportPartValue[] =>
  parts.filter((part, index) => parts.slice(0, index).every((earlier) => earlier.label !== part.label))

const chooseReports = (parts: readonly ReportPartValue[]): readonly PartWithReport[] =>
  parts.flatMap((part) => {
    if (part.report === undefined) {
      return []
    }
    return [{ ...part, report: part.report }]
  })

const survivorsOf = (report: MutationTestResult): readonly Survivor[] =>
  Object.entries(report.files)
    .flatMap(([file, fileResult]) =>
      fileResult.mutants
        .filter((mutant) => SURVIVOR_STATUSES[mutant.status] === true)
        .map((mutant) => ({
          file,
          line: mutant.location.start.line,
          column: mutant.location.start.column,
          status: mutant.status,
          mutatorName: mutant.mutatorName,
          replacement: mutant.replacement ?? '',
        }))
    )
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line)

const packageRows = (parts: readonly ReportPartValue[], expected: readonly string[]): readonly VerdictRow[] => {
  const absent = expected.filter((name) => !parts.some((part) => part.label === name))
  return [...parts.map((part) => part.label), ...absent]
    .sort()
    .map((label) => {
      const part = parts.find((candidate) => candidate.label === label)
      return verdictOf(label, scoreFor(part), part?.outcome, part?.incomplete === true)
    })
}

const allPackagesRow = (reports: readonly PartWithReport[], merged: MutationTestResult): VerdictRow =>
  verdictOf(ALL_PACKAGES_LABEL, scoreOf(merged.files), outcomeOf(reports), reports.some((part) => part.incomplete))

const decideMerge = (command: MergeReportPartsCommand): Result.Result<Decision, DecisionError> => {
  const parts = uniqueParts(command.parts)
  if (parts.length === 0) {
    return Result.fail(MissingPackages.make({ packages: [...(command.expectedPackages ?? [])] }))
  }
  const reports = chooseReports(parts)
  const rows = packageRows(parts, command.expectedPackages ?? [])
  if (reports.length === 0) {
    return Result.succeed(NoMergedReports.make({ rows }))
  }
  const report = mergeParts(reports)
  return Result.succeed(
    MergedReports.make({
      report,
      rows: [allPackagesRow(reports, report), ...rows],
      survivors: survivorsOf(report),
    }),
  )
}

function decide(command: MergeReportPartsCommand): Result.Result<Decision, DecisionError> {
  if (firstDuplicateLabel(command.parts) !== '') {
    return Result.fail(DuplicatePackageLabel.make({ label: firstDuplicateLabel(command.parts) }))
  }
  return decideMerge(command)
}

export const mergeReportParts = Workflow.make(MergeReportPartsCommand, decide)
