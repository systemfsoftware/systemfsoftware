import { makeHtmlReporter } from '@systemfsoftware/stryker-js-html-reporter'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Metrics'
import { MutationTestResultSchema } from '@systemfsoftware/stryker-js/Report'
import type { FileResult, MutantResult, MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import { MutationTestReportReady } from '@systemfsoftware/stryker-js/Reporter'
import type { ReporterEvent } from '@systemfsoftware/stryker-js/Reporter'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type { MergeReportsRequest } from './Cli.schema.js'
import {
  DuplicatePackageLabel,
  MergedReports,
  mergeReportParts,
  MergeReportPartsCommand,
  MissingPackages,
  type NoMergedReports,
  type ReportPart,
} from './merge-report-parts.workflow.js'
import { MergeReportsFailed, PartMetaSchema, StreamMutantLineSchema } from './merge-reports.schema.js'

const PART_MARKER_FILE = 'mutation-part.json'
const PART_REPORT_FILE = 'mutation-report.json'
const PART_STREAM_FILE = 'mutation-stream.jsonl'
const MERGED_REPORT_FILE = 'mutation-report.json'
const MERGED_HTML_FILE = 'mutation-report.html'
const MERGED_SUMMARY_FILE = 'summary.md'
const STREAM_REPORT_THRESHOLDS = { high: 100, low: 80 }
const SURVIVOR_CAP = 100
const ALL_PACKAGES_LABEL = '**all**'
const STEP_SUMMARY_VARIABLE = 'GITHUB_STEP_SUMMARY'

type ReportPartValue = S.Schema.Type<typeof ReportPart>
type StreamMutantLine = S.Schema.Type<typeof StreamMutantLineSchema>
type PartMeta = S.Schema.Type<typeof PartMetaSchema>

interface ReadParts {
  readonly parts: readonly ReportPartValue[]
  readonly skipped: readonly string[]
  readonly unreadable: readonly string[]
}

interface PartRead {
  readonly dir: string
  readonly part: Option.Option<ReportPartValue>
  readonly unreadable: boolean
}

/** The value when the condition holds, the fallback otherwise. */
const whenHolds = <A>(condition: boolean, value: A, fallback: A): A =>
  Option.getOrElse(Option.filter(Option.some(value), () => condition), () => fallback)

const failMerge = (reason: string): Effect.Effect<never, MergeReportsFailed> =>
  Effect.gen(function*() {
    yield* Console.error(`stryker merge-reports: ${reason}`)
    return yield* Effect.fail(MergeReportsFailed.make({ reason }))
  })

const readOptional = (file: string): Effect.Effect<string | undefined, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined))
  })

const streamMutant = (line: StreamMutantLine): MutantResult => {
  const mutant: MutantResult = {
    id: line.id,
    mutatorName: line.mutator,
    status: line.status,
    location: line.location,
  }
  if (line.replacement === null) {
    return mutant
  }
  return { ...mutant, replacement: line.replacement }
}

const decodeStreamLines = (text: string): readonly StreamMutantLine[] =>
  text
    .split('\n')
    .map((raw) => raw.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => Option.toArray(S.decodeUnknownOption(S.fromJsonString(StreamMutantLineSchema))(line)))

const groupStreamMutant = (
  groups: Record<string, MutantResult[]>,
  value: StreamMutantLine,
): Record<string, MutantResult[]> => {
  const mutants = Option.getOrElse(Option.fromUndefinedOr(groups[value.file]), (): MutantResult[] => [])
  mutants.push(streamMutant(value))
  groups[value.file] = mutants
  return groups
}

const groupedMutants = (text: string): Record<string, MutantResult[]> =>
  decodeStreamLines(text).reduce<Record<string, MutantResult[]>>(groupStreamMutant, {})

const fileResults = (grouped: Record<string, MutantResult[]>): Record<string, FileResult> =>
  Object.fromEntries(
    Object.entries(grouped).map(([file, mutants]): [string, FileResult] => [
      file,
      { language: 'javascript', source: '', mutants },
    ]),
  )

const streamReport = (text: string): MutationTestResult | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.filter(Option.some(groupedMutants(text)), (grouped) => Object.keys(grouped).length > 0),
      (grouped): MutationTestResult => ({
        schemaVersion: '1.0',
        thresholds: STREAM_REPORT_THRESHOLDS,
        files: fileResults(grouped),
      }),
    ),
  )

const listDirectory = (dir: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))
  })

const isDirectory = (full: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const info = yield* fs.stat(full).pipe(Effect.orElseSucceed(() => undefined))
    return Option.match(Option.fromUndefinedOr(info), {
      onNone: () => false,
      onSome: (entry) => entry.type === 'Directory',
    })
  })

const childPartDirs = (
  dir: string,
  name: string,
): Effect.Effect<readonly string[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const full = path.join(dir, name)
    if (yield* isDirectory(full)) {
      return yield* findPartDirs(full)
    }
    return whenHolds(name === PART_MARKER_FILE, [dir], [])
  })

const findPartDirs = (dir: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const names: ReadonlyArray<string> = [...(yield* listDirectory(dir))].sort()
    const found = yield* Effect.forEach(names, (name) => childPartDirs(dir, name))
    return found.flat()
  })

const partBase = (meta: PartMeta): ReportPartValue => ({
  label: meta.package,
  outcome: meta.outcome,
  incomplete: false,
})

const partFromReportText = (dir: string, base: ReportPartValue, text: string): PartRead => {
  const report = S.decodeUnknownOption(S.fromJsonString(MutationTestResultSchema))(text)
  return Option.match(report, {
    onNone: (): PartRead => ({ dir, part: Option.some(base), unreadable: true }),
    onSome: (value): PartRead => ({ dir, part: Option.some({ ...base, report: value }), unreadable: false }),
  })
}

const readPartStream = (
  dir: string,
  base: ReportPartValue,
): Effect.Effect<PartRead, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const text = yield* readOptional(path.join(dir, PART_STREAM_FILE))
    const report = Option.fromUndefinedOr(text).pipe(
      Option.flatMap((streamed) => Option.fromUndefinedOr(streamReport(streamed))),
    )
    return Option.match(report, {
      onNone: (): PartRead => ({ dir, part: Option.some(base), unreadable: false }),
      onSome: (value): PartRead => ({
        dir,
        part: Option.some({ ...base, incomplete: true, report: value }),
        unreadable: false,
      }),
    })
  })

const readPartReport = (
  dir: string,
  base: ReportPartValue,
): Effect.Effect<PartRead, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const text = yield* readOptional(path.join(dir, PART_REPORT_FILE))
    return yield* Option.match(Option.fromUndefinedOr(text), {
      onNone: () => readPartStream(dir, base),
      onSome: (present) => Effect.succeed(partFromReportText(dir, base, present)),
    })
  })

const readPart = (dir: string): Effect.Effect<PartRead, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const metaText = yield* readOptional(path.join(dir, PART_MARKER_FILE))
    const meta = Option.fromUndefinedOr(metaText).pipe(
      Option.flatMap((text) => S.decodeUnknownOption(S.fromJsonString(PartMetaSchema))(text)),
    )
    return yield* Option.match(meta, {
      onNone: () => Effect.succeed<PartRead>({ dir, part: Option.none(), unreadable: false }),
      onSome: (present) => readPartReport(dir, partBase(present)),
    })
  })

const readParts = (partsDir: string): Effect.Effect<ReadParts, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const dirs = yield* findPartDirs(partsDir)
    const reads = yield* Effect.forEach(dirs, readPart)
    return {
      parts: reads.flatMap((read) => Option.toArray(read.part)),
      skipped: reads.filter((read) => Option.isNone(read.part)).map((read) => read.dir),
      unreadable: reads.filter((read) => read.unreadable).map((read) => read.dir),
    }
  })

const decodePackageList = (raw: string): Effect.Effect<readonly string[] | undefined, MergeReportsFailed> =>
  Option.match(S.decodeUnknownOption(S.fromJsonString(S.Array(S.String)))(raw), {
    onNone: () => failMerge(`--packages is not a JSON array: ${raw}`),
    onSome: (packages) => Effect.succeed(packages),
  })

const parsePackages = (raw: string | undefined): Effect.Effect<readonly string[] | undefined, MergeReportsFailed> =>
  Option.match(Option.filter(Option.fromUndefinedOr(raw), (text) => text.length > 0), {
    onNone: () => Effect.succeed(undefined),
    onSome: decodePackageList,
  })

const SUMMARY_TABLE_HEADER: readonly string[] = [
  '| package | score | killed | survived | no cov | timeout | compile err | verdict |',
  '| --- | --: | --: | --: | --: | --: | --: | :-: |',
]

const verdictRow = (row: MergedReports['rows'][number]): string =>
  `| ${row.label} | ${row.score} | ${row.cells.join(' | ')} | ${row.verdict} |`

const survivorLine = (survivor: MergedReports['survivors'][number]): string =>
  `- \`${survivor.file}:${survivor.line}:${survivor.column}\` ${survivor.status} \`${survivor.mutatorName}\` → \`${survivor.replacement}\``

const survivorSection = (survivors: MergedReports['survivors']): readonly string[] => [
  '',
  '### Survivors',
  '',
  ...survivors.slice(0, SURVIVOR_CAP).map(survivorLine),
  ...whenHolds(survivors.length > SURVIVOR_CAP, [
    `- … and ${survivors.length - SURVIVOR_CAP} more; see mutation-report.html in the run artifact.`,
  ], []),
]

const warningSection = (skipped: readonly string[]): readonly string[] => [
  '',
  '### Warnings',
  '',
  ...skipped.map((name) => `- \`${name}\`: no readable mutation-part.json`),
]

const mergedCountLine = (packageRows: MergedReports['rows']): string =>
  `Merged ${packageRows.filter((row) => row.score !== 'no report').length} of ${packageRows.length} package report(s).`

const summaryMarkdown = (
  rows: MergedReports['rows'],
  survivors: MergedReports['survivors'],
  skipped: readonly string[],
  unreadableCount: number,
): string => {
  const packageRows = rows.filter((row) => row.label !== ALL_PACKAGES_LABEL)
  const lines = [
    '## Mutation',
    '',
    mergedCountLine(packageRows),
    '',
    ...SUMMARY_TABLE_HEADER,
    ...rows.map(verdictRow),
    ...whenHolds(survivors.length > 0, survivorSection(survivors), []),
    ...whenHolds(skipped.length > 0, warningSection(skipped), []),
    ...whenHolds(unreadableCount > 0, ['', `Report exited non-zero: ${unreadableCount} unreadable part(s).`], []),
  ]
  return `${lines.join('\n')}\n`
}

const writeFile = (
  file: string,
  content: string,
  append: boolean,
): Effect.Effect<void, MergeReportsFailed, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    if (append) {
      yield* fs.writeFileString(file, content, { flag: 'a' })
      return
    }
    yield* fs.writeFileString(file, content)
  }).pipe(Effect.catchCause(() => failMerge(`cannot write ${file}`)))

async function* toStream(events: readonly ReporterEvent[]): AsyncGenerator<ReporterEvent> {
  yield* events
}

const writeHtmlReport = (fileName: string, report: MutationTestResult): Effect.Effect<void, MergeReportsFailed> =>
  Effect.gen(function*() {
    const decoded = S.decodeUnknownOption(StrykerOptionsSchema)({ htmlReporter: { fileName } })
    if (Option.isNone(decoded)) {
      return yield* failMerge(`cannot configure the html report at ${fileName}`)
    }
    const metrics = calculateMetrics(report.files)
    yield* Effect.promise(() =>
      makeHtmlReporter(decoded.value, {})(toStream([new MutationTestReportReady({ report, metrics })]))
    )
  })

const failureReason = (error: DuplicatePackageLabel | MissingPackages, partsDir: string): string =>
  Match.value(error).pipe(
    Match.tag('DuplicatePackageLabel', (duplicate) => `duplicate package ${duplicate.label}`),
    Match.tag('MissingPackages', (missing) => {
      if (missing.packages.length === 0) {
        return `no mutation report parts under ${partsDir}`
      }
      return `no mutation report parts under ${partsDir} for ${missing.packages.join(', ')}`
    }),
    Match.exhaustive,
  )

const survivorList = (decision: MergedReports | NoMergedReports): MergedReports['survivors'] => {
  if (S.is(MergedReports)(decision)) {
    return decision.survivors
  }
  return []
}

const mergedReport = (decision: MergedReports | NoMergedReports): MutationTestResult | undefined => {
  if (S.is(MergedReports)(decision)) {
    return decision.report
  }
  return undefined
}

const ensurePartsDir = (fs: FileSystem.FileSystem, partsDir: string): Effect.Effect<void, MergeReportsFailed> =>
  Effect.gen(function*() {
    if (yield* fs.exists(partsDir).pipe(Effect.orElseSucceed(() => false))) {
      return
    }
    return yield* failMerge(`no such parts directory ${partsDir}`)
  })

const decideReports = (
  parts: readonly ReportPartValue[],
  expectedPackages: readonly string[] | undefined,
  partsDir: string,
): Effect.Effect<MergedReports | NoMergedReports, MergeReportsFailed> =>
  Effect.gen(function*() {
    const decision = mergeReportParts(MergeReportPartsCommand.make({ parts, expectedPackages }))
    if (Result.isSuccess(decision)) {
      return decision.success
    }
    return yield* failMerge(failureReason(decision.failure, partsDir))
  })

const writeReportOutputs = (
  path: Path.Path,
  out: string,
  report: MutationTestResult | undefined,
): Effect.Effect<void, MergeReportsFailed, FileSystem.FileSystem> =>
  Effect.forEach(
    Option.toArray(Option.fromUndefinedOr(report)),
    (present) =>
      Effect.gen(function*() {
        yield* writeFile(path.join(out, MERGED_REPORT_FILE), JSON.stringify(present), false)
        yield* writeHtmlReport(path.join(out, MERGED_HTML_FILE), present)
      }),
    { discard: true },
  )

const appendStepSummary = (summary: string): Effect.Effect<void, MergeReportsFailed, FileSystem.FileSystem> =>
  Effect.forEach(
    Option.toArray(
      Option.filter(Option.fromUndefinedOr(process.env[STEP_SUMMARY_VARIABLE]), (file) => file.length > 0),
    ),
    (file) => writeFile(file, summary, true),
    { discard: true },
  )

export const runMergeReports = (
  request: MergeReportsRequest,
): Effect.Effect<void, MergeReportsFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const out = request.out
    const expectedPackages = yield* parsePackages(request.packages)
    yield* ensurePartsDir(fs, request.parts)
    const { parts, skipped, unreadable } = yield* readParts(request.parts)
    const decision = yield* decideReports(parts, expectedPackages, request.parts)
    yield* fs.makeDirectory(out, { recursive: true }).pipe(Effect.catchCause(() => failMerge(`cannot create ${out}`)))
    yield* writeReportOutputs(path, out, mergedReport(decision))
    const summary = summaryMarkdown(decision.rows, survivorList(decision), skipped, unreadable.length)
    yield* writeFile(path.join(out, MERGED_SUMMARY_FILE), summary, false)
    yield* appendStepSummary(summary)
    yield* Console.log(summary)
    yield* Effect.forEach(
      whenHolds(unreadable.length > 0, [`${unreadable.length} unreadable part(s): ${unreadable.join(', ')}`], []),
      failMerge,
      { discard: true },
    )
  })
