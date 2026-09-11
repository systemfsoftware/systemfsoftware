import { Workflow } from '@systemfsoftware/effect-cell-types'
import { MutationTestResultSchema } from '@systemfsoftware/stryker-js/Report'
import type {
  FileResult,
  MutantResult,
  MutationTestResult,
  TestFile,
  Thresholds,
} from '@systemfsoftware/stryker-js/Report'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const MERGED_SCHEMA_VERSION = '1.7'
const DEFAULT_THRESHOLDS = { high: 80, low: 60 }
const FAILING_OUTCOME = 'failure'
const PASSING_OUTCOME = 'success'
const PERFECT_MUTATION_SCORE = 100
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
const SEGMENT_SEPARATORS = /[/\\]/
const EMPTY_SEGMENTS: readonly string[] = []
const EMPTY_PACKAGES: readonly string[] = []
const EMPTY_TEST_FILES: Readonly<Record<string, TestFile>> = {}

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

/** The value a present option carries, or the fallback a missing one takes. */
const orDefault = <A>(present: Option.Option<A>, fallback: A): A => Option.getOrElse(present, () => fallback)

const thresholdsOf = (part: PartWithReport | undefined): Thresholds =>
  orDefault(Option.map(Option.fromUndefinedOr(part), (present) => present.report.thresholds), DEFAULT_THRESHOLDS)

const hasReport = (part: ReportPartValue): part is PartWithReport => part.report !== undefined

const scoreFor = (part: ReportPartValue | undefined): Score | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.filter(Option.fromUndefinedOr(part), hasReport),
      (present) => scoreOf(present.report.files),
    ),
  )

const outcomeOf = (reports: readonly PartWithReport[]): string =>
  Match.value(reports.some((part) => part.outcome === FAILING_OUTCOME)).pipe(
    Match.when(true, () => FAILING_OUTCOME),
    Match.when(false, () => PASSING_OUTCOME),
    Match.exhaustive,
  )

const normalizeName = (fileName: string): string => fileName.split(SEGMENT_SEPARATORS).filter(Boolean).join('/')

const commonBasePath = (fileNames: readonly string[]): string => {
  const directories: readonly (readonly string[])[] = fileNames.map((fileName) =>
    fileName.split(SEGMENT_SEPARATORS).slice(0, -1)
  )
  return Arr.reduce(
    directories,
    orDefault(Arr.head(directories), EMPTY_SEGMENTS),
    (left, right) => Arr.takeWhile(left, (segment, index) => right[index] === segment),
  ).join('/')
}

const normalizedNames = <A>(input: Readonly<Record<string, A>>): Readonly<Record<string, A>> => {
  const base = commonBasePath(Object.keys(input))
  return Object.fromEntries(
    Object.entries(input).map(
      ([fileName, value]): readonly [string, A] => [normalizeName(fileName.slice(base.length)), value],
    ),
  )
}

const uniqueId = (label: string, id: string): string => `${label}_${id}`

const uniqueIds = (label: string, ids: readonly string[] | undefined): readonly string[] | undefined =>
  Option.getOrUndefined(
    Option.map(Option.fromUndefinedOr(ids), (present) => present.map((id) => uniqueId(label, id))),
  )

const rewrittenMutant = (label: string, mutant: MutantResult): MutantResult => ({
  ...mutant,
  id: uniqueId(label, mutant.id),
  killedBy: uniqueIds(label, mutant.killedBy),
  coveredBy: uniqueIds(label, mutant.coveredBy),
})

const withProjectRoot = (report: MutationTestResult, projectRoot: string | undefined): MutationTestResult =>
  Option.match(Option.fromUndefinedOr(projectRoot), {
    onNone: () => report,
    onSome: (root) => ({ ...report, projectRoot: root }),
  })

const mergedFiles = (parts: readonly PartWithReport[]): Record<string, FileResult> =>
  Object.fromEntries(
    parts.flatMap((part) =>
      Object.entries(normalizedNames(part.report.files)).map(
        ([fileName, file]): readonly [string, FileResult] => [
          `${part.label}/${fileName}`,
          { ...file, mutants: file.mutants.map((mutant) => rewrittenMutant(part.label, mutant)) },
        ],
      )
    ),
  )

const mergedTestFiles = (parts: readonly PartWithReport[]): Record<string, TestFile> =>
  Object.fromEntries(
    parts.flatMap((part) =>
      Object.entries(
        normalizedNames(orDefault(Option.fromUndefinedOr(part.report.testFiles), EMPTY_TEST_FILES)),
      ).map(
        ([fileName, testFile]): readonly [string, TestFile] => [
          `${part.label}/${fileName}`,
          { ...testFile, tests: testFile.tests.map((test) => ({ ...test, id: uniqueId(part.label, test.id) })) },
        ],
      )
    ),
  )

const withTestFiles = (report: MutationTestResult, testFiles: Record<string, TestFile>): MutationTestResult =>
  Match.value(Object.keys(testFiles).length > 0).pipe(
    Match.when(true, () => ({ ...report, testFiles })),
    Match.when(false, () => report),
    Match.exhaustive,
  )

const mergeParts = (parts: readonly PartWithReport[]): MutationTestResult => {
  const merged: MutationTestResult = {
    files: mergedFiles(parts),
    schemaVersion: MERGED_SCHEMA_VERSION,
    thresholds: thresholdsOf(parts[0]),
    config: {},
  }
  const projectRoots = parts.flatMap((part) => Option.toArray(Option.fromUndefinedOr(part.report.projectRoot)))
  return withProjectRoot(withTestFiles(merged, mergedTestFiles(parts)), commonProjectRoot(projectRoots))
}

const commonProjectRoot = (roots: readonly string[]): string | undefined =>
  Option.getOrUndefined(Option.map(Option.liftPredicate(roots, Arr.isReadonlyArrayNonEmpty), commonBasePath))

const mutationScoreOf = (totalDetected: number, totalValid: number): number =>
  Match.value(totalValid === 0).pipe(
    Match.when(true, () => Number.NaN),
    Match.when(false, () => (totalDetected / totalValid) * 100),
    Match.exhaustive,
  )

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

const cellsFor = (score: Score | undefined): readonly string[] =>
  orDefault(Option.map(Option.fromUndefinedOr(score), (present) => present.cells), ABSENT_CELLS)

const incompleteVerdict = (outcome: string | undefined): string =>
  Match.value(outcome === PASSING_OUTCOME).pipe(
    Match.when(true, () => VERDICT_WARN),
    Match.when(false, () => VERDICT_FAIL),
    Match.exhaustive,
  )

const passingVerdict = (score: Score, outcome: string | undefined): string =>
  Match.value({ perfect: score.mutationScore === PERFECT_MUTATION_SCORE, passing: outcome === PASSING_OUTCOME }).pipe(
    Match.when({ perfect: true, passing: true }, () => VERDICT_OK),
    Match.orElse(() => VERDICT_FAIL),
  )

const renderedScore = (mutationScore: number): string =>
  Match.value(mutationScore).pipe(
    Match.when(PERFECT_MUTATION_SCORE, () => SCORE_PERFECT),
    Match.orElse(() => mutationScore.toFixed(2)),
  )

const scoredRow = (label: string, score: Score, outcome: string | undefined): VerdictRow =>
  Match.value(Number.isNaN(score.mutationScore)).pipe(
    Match.when(true, () => ({ label, score: SCORE_UNDEFINED, cells: score.cells, verdict: VERDICT_WARN })),
    Match.when(false, () => ({
      label,
      score: renderedScore(score.mutationScore),
      cells: score.cells,
      verdict: passingVerdict(score, outcome),
    })),
    Match.exhaustive,
  )

const completeRow = (label: string, score: Score | undefined, outcome: string | undefined): VerdictRow =>
  Option.match(Option.fromUndefinedOr(score), {
    onNone: () => ({ label, score: SCORE_ABSENT, cells: ABSENT_CELLS, verdict: VERDICT_WARN }),
    onSome: (present) => scoredRow(label, present, outcome),
  })

const verdictOf = (
  label: string,
  score: Score | undefined,
  outcome: string | undefined,
  incomplete: boolean,
): VerdictRow =>
  Match.value(incomplete).pipe(
    Match.when(true, () => ({
      label,
      score: SCORE_INCOMPLETE,
      cells: cellsFor(score),
      verdict: incompleteVerdict(outcome),
    })),
    Match.when(false, () => completeRow(label, score, outcome)),
    Match.exhaustive,
  )

/** The label a second part repeats, and `none` when it repeats none a report can name. */
const repeatedLabel = (parts: readonly ReportPartValue[]): Option.Option<string> =>
  Option.filter(
    Option.map(
      Option.fromUndefinedOr(
        parts.find((part, index) => parts.slice(0, index).some((earlier) => earlier.label === part.label)),
      ),
      (duplicate) => duplicate.label,
    ),
    (label) => label !== '',
  )

const uniqueParts = (parts: readonly ReportPartValue[]): readonly ReportPartValue[] =>
  parts.filter((part, index) => parts.slice(0, index).every((earlier) => earlier.label !== part.label))

const chooseReports = (parts: readonly ReportPartValue[]): readonly PartWithReport[] =>
  parts.flatMap((part) =>
    Option.toArray(Option.map(Option.fromUndefinedOr(part.report), (report) => ({ ...part, report })))
  )

const byFileThenLine = (left: Survivor, right: Survivor): number =>
  orDefault(
    Option.liftPredicate(left.file.localeCompare(right.file), (ordered) => ordered !== 0),
    left.line - right.line,
  )

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
          replacement: orDefault(Option.fromNullishOr(mutant.replacement), ''),
        }))
    )
    .sort(byFileThenLine)

const rowOf = (label: string, part: ReportPartValue | undefined): VerdictRow =>
  Option.match(Option.fromUndefinedOr(part), {
    onNone: () => verdictOf(label, undefined, undefined, false),
    onSome: (present) => verdictOf(label, scoreFor(present), present.outcome, present.incomplete),
  })

const packageRows = (parts: readonly ReportPartValue[], expected: readonly string[]): readonly VerdictRow[] => {
  const absent = expected.filter((name) => !parts.some((part) => part.label === name))
  return [...parts.map((part) => part.label), ...absent]
    .sort()
    .map((label) => rowOf(label, parts.find((candidate) => candidate.label === label)))
}

const allPackagesRow = (reports: readonly PartWithReport[], merged: MutationTestResult): VerdictRow =>
  verdictOf(ALL_PACKAGES_LABEL, scoreOf(merged.files), outcomeOf(reports), reports.some((part) => part.incomplete))

const mergedReports = (reports: readonly PartWithReport[], rows: readonly VerdictRow[]): MergedReports => {
  const report = mergeParts(reports)
  return MergedReports.make({
    report,
    rows: [allPackagesRow(reports, report), ...rows],
    survivors: survivorsOf(report),
  })
}

const mergedOutcome = (
  reports: readonly PartWithReport[],
  rows: readonly VerdictRow[],
): Result.Result<Decision, DecisionError> =>
  Match.value(reports.length === 0).pipe(
    Match.when(true, () => Result.succeed(NoMergedReports.make({ rows }))),
    Match.when(false, () => Result.succeed(mergedReports(reports, rows))),
    Match.exhaustive,
  )

const decideMerge = (command: MergeReportPartsCommand): Result.Result<Decision, DecisionError> => {
  const parts = uniqueParts(command.parts)
  const expected = orDefault(Option.fromNullishOr(command.expectedPackages), EMPTY_PACKAGES)
  const rows = packageRows(parts, expected)
  return Match.value(parts.length === 0).pipe(
    Match.when(true, () => Result.fail(MissingPackages.make({ packages: [...expected] }))),
    Match.when(false, () => mergedOutcome(chooseReports(parts), rows)),
    Match.exhaustive,
  )
}

const DuplicateLabelFound = S.TaggedStruct('DuplicateLabelFound', { label: S.String })
const LabelsDistinct = S.TaggedStruct('LabelsDistinct', {})
const LabelCheck = S.Union([DuplicateLabelFound, LabelsDistinct])
type LabelCheck = S.Schema.Type<typeof LabelCheck>

const labelCheckOf = (parts: readonly ReportPartValue[]): LabelCheck =>
  Option.match(repeatedLabel(parts), {
    onNone: () => LabelsDistinct.make({}),
    onSome: (label): LabelCheck => DuplicateLabelFound.make({ label }),
  })

const decide = (command: MergeReportPartsCommand): Result.Result<Decision, DecisionError> =>
  Match.value(labelCheckOf(command.parts)).pipe(
    Match.tag('DuplicateLabelFound', (found) => Result.fail(DuplicatePackageLabel.make({ label: found.label }))),
    Match.tag('LabelsDistinct', () => decideMerge(command)),
    Match.exhaustive,
  )

export const mergeReportParts = Workflow.make(MergeReportPartsCommand, decide)
