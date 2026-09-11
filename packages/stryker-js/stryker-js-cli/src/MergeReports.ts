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

interface ReadParts {
  readonly parts: readonly ReportPartValue[]
  readonly skipped: readonly string[]
  readonly unreadable: readonly string[]
}

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

const reportFromStream = (text: string): MutationTestResult | undefined => {
  const files: Record<string, FileResult> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) {
      continue
    }
    const event = S.decodeUnknownOption(S.fromJsonString(StreamMutantLineSchema))(line)
    if (Option.isNone(event)) {
      continue
    }
    const value = event.value
    const existing = files[value.file] ?? { language: 'javascript', source: '', mutants: [] }
    files[value.file] = { ...existing, mutants: [...existing.mutants, streamMutant(value)] }
  }
  if (Object.keys(files).length === 0) {
    return undefined
  }
  return { schemaVersion: '1.0', thresholds: STREAM_REPORT_THRESHOLDS, files }
}

const findPartDirs = (dir: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const names: ReadonlyArray<string> = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))
    const found: string[] = []
    for (const name of [...names].sort()) {
      const full = path.join(dir, name)
      const info = yield* fs.stat(full).pipe(Effect.orElseSucceed(() => undefined))
      if (info !== undefined && info.type === 'Directory') {
        found.push(...(yield* findPartDirs(full)))
        continue
      }
      if (name === PART_MARKER_FILE) {
        found.push(dir)
      }
    }
    return found
  })

const readParts = (partsDir: string): Effect.Effect<ReadParts, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const parts: ReportPartValue[] = []
    const skipped: string[] = []
    const unreadable: string[] = []
    for (const dir of yield* findPartDirs(partsDir)) {
      const metaText = yield* readOptional(path.join(dir, PART_MARKER_FILE))
      const meta = S.decodeUnknownOption(S.fromJsonString(PartMetaSchema))(metaText ?? '')
      if (Option.isNone(meta)) {
        skipped.push(dir)
        continue
      }
      const base = { label: meta.value.package, outcome: meta.value.outcome, incomplete: false }
      const reportText = yield* readOptional(path.join(dir, PART_REPORT_FILE))
      if (reportText !== undefined) {
        const report = S.decodeUnknownOption(S.fromJsonString(MutationTestResultSchema))(reportText)
        if (Option.isSome(report)) {
          parts.push({ ...base, report: report.value })
          continue
        }
        unreadable.push(dir)
        parts.push(base)
        continue
      }
      const reconstructed = reportFromStream((yield* readOptional(path.join(dir, PART_STREAM_FILE))) ?? '')
      if (reconstructed === undefined) {
        parts.push(base)
        continue
      }
      parts.push({ ...base, incomplete: true, report: reconstructed })
    }
    return { parts, skipped, unreadable }
  })

const parsePackages = (raw: string | undefined): Effect.Effect<readonly string[] | undefined, MergeReportsFailed> => {
  if (raw === undefined || raw.length === 0) {
    return Effect.succeed(undefined)
  }
  const decoded = S.decodeUnknownOption(S.fromJsonString(S.Array(S.String)))(raw)
  if (Option.isNone(decoded)) {
    return failMerge(`--packages is not a JSON array: ${raw}`)
  }
  return Effect.succeed(decoded.value)
}

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
    `Merged ${
      packageRows.filter((row) => row.score !== 'no report').length
    } of ${packageRows.length} package report(s).`,
    '',
    '| package | score | killed | survived | no cov | timeout | compile err | verdict |',
    '| --- | --: | --: | --: | --: | --: | --: | :-: |',
    ...rows.map((row) => `| ${row.label} | ${row.score} | ${row.cells.join(' | ')} | ${row.verdict} |`),
  ]
  if (survivors.length > 0) {
    lines.push('', '### Survivors', '')
    lines.push(
      ...survivors
        .slice(0, SURVIVOR_CAP)
        .map(
          (survivor) =>
            `- \`${survivor.file}:${survivor.line}:${survivor.column}\` ${survivor.status} \`${survivor.mutatorName}\` → \`${survivor.replacement}\``,
        ),
    )
    if (survivors.length > SURVIVOR_CAP) {
      lines.push(`- … and ${survivors.length - SURVIVOR_CAP} more; see mutation-report.html in the run artifact.`)
    }
  }
  if (skipped.length > 0) {
    lines.push('', '### Warnings', '')
    for (const name of skipped) {
      lines.push(`- \`${name}\`: no readable mutation-part.json`)
    }
  }
  if (unreadableCount > 0) {
    lines.push('', `Report exited non-zero: ${unreadableCount} unreadable part(s).`)
  }
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

export const runMergeReports = (
  request: MergeReportsRequest,
): Effect.Effect<void, MergeReportsFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const expectedPackages = yield* parsePackages(request.packages)
    if (!(yield* fs.exists(request.parts).pipe(Effect.orElseSucceed(() => false)))) {
      return yield* failMerge(`no such parts directory ${request.parts}`)
    }
    const { parts, skipped, unreadable } = yield* readParts(request.parts)
    const decision = mergeReportParts(MergeReportPartsCommand.make({ parts, expectedPackages }))
    if (Result.isFailure(decision)) {
      return yield* failMerge(failureReason(decision.failure, request.parts))
    }
    const out = request.out
    yield* fs.makeDirectory(out, { recursive: true }).pipe(Effect.catchCause(() => failMerge(`cannot create ${out}`)))
    const report = mergedReport(decision.success)
    if (report !== undefined) {
      yield* writeFile(path.join(out, MERGED_REPORT_FILE), JSON.stringify(report), false)
      yield* writeHtmlReport(path.join(out, MERGED_HTML_FILE), report)
    }
    const summary = summaryMarkdown(decision.success.rows, survivorList(decision.success), skipped, unreadable.length)
    yield* writeFile(path.join(out, MERGED_SUMMARY_FILE), summary, false)
    const stepSummary = process.env[STEP_SUMMARY_VARIABLE]
    if (stepSummary !== undefined && stepSummary.length > 0) {
      yield* writeFile(stepSummary, summary, true)
    }
    yield* Console.log(summary)
    if (unreadable.length > 0) {
      return yield* failMerge(`${unreadable.length} unreadable part(s): ${unreadable.join(', ')}`)
    }
  })
