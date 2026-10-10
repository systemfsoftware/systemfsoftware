#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run
// mutation-job.ts - run one planned Mutation job, and merge every job's parts into the report.
//
//   run      run each package of $JOB (a job from `test-timings.ts plan --task
//            mutation`) in turn under a cap: one timing part for the job, a
//            summary and report check per package, a staged report part and
//            incremental file per package. Exits 1 when a package produced no report.
// report  fold every shard part of a package into one package report, refusing
//         shards that mutated the same file, a staged report that is not a
//         complete Stryker report, and a stream mutant line that does not
//         decode; merge the packages into one mutation.json keyed by
//         repo-relative path under the strictest thresholds any package
//         declares, plus a summary.md with a row for every package $JOBS
//         planned, a package with no part included.

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, extname, join } from '@std/path'
import { Option, Schema } from 'effect'
import { buildRequireError, buildSummary, isMutantLine, loadState, reportIssue } from './build-mutation-summary.ts'
import type { Entry, Job, Part, Shard } from './test-timings.ts'

type Outcome = 'success' | 'failure'

type PartMeta = { readonly package: string; readonly outcome: Outcome; readonly shard?: Shard }

type Position = { readonly line: number; readonly column: number }

type Mutant = {
  readonly id: string
  readonly status: string
  readonly mutatorName: string
  readonly location: { readonly start: Position; readonly end: Position }
  readonly replacement?: string
}

type FileResult = { readonly language: string; readonly source: string; readonly mutants: readonly Mutant[] }

type Files = Readonly<Record<string, FileResult>>

type Thresholds = { readonly high: number; readonly low: number; readonly break?: number | null }

/** A package's `reports/mutation/mutation.json`, in mutation-testing-report-schema. */
type Report = { readonly schemaVersion: string; readonly thresholds: Thresholds; readonly files: Files }

/** A staged report decoded as complete; Stryker always writes thresholds, but the schema makes them optional. */
type StagedReport = { readonly schemaVersion: string; readonly thresholds?: Thresholds; readonly files: Files }

type StagedPart = { readonly meta: PartMeta; readonly report?: StagedReport; readonly stream?: string }

/** A package whose every planned shard staged a report is complete; otherwise its files are what it got. */
type PackageReport = {
  readonly dir: string
  readonly outcome: Outcome
  readonly complete: boolean
  readonly files: Files
  readonly schemaVersion?: string
  readonly thresholds?: Thresholds
}

const DEFAULT_THRESHOLDS: Thresholds = { high: 80, low: 60, break: null }

const ThresholdsSchema = Schema.Struct({
  high: Schema.Number,
  low: Schema.Number,
  break: Schema.optional(Schema.NullOr(Schema.Number)),
})

const incrementalFileOf = (shard: Shard | undefined): string =>
  shard === undefined
    ? 'reports/stryker-incremental.json'
    : `reports/stryker-incremental-${shard.index}of${shard.count}.json`

const labelOf = (dir: string, shard: Shard | undefined): string =>
  shard === undefined ? dir : `${dir} (${shard.index}/${shard.count})`

const slugOf = (dir: string): string => dir.replaceAll('/', '-')

const shardOfJob = (job: Job): Shard | undefined =>
  job.shard === undefined ? undefined : { index: job.shard.index, count: job.shard.count }

const readText = (path: string): Promise<string> => Deno.readTextFile(path)

const readIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined
    throw error
  }
}

const copyIfPresent = async (from: string, to: string): Promise<void> => {
  const text = await readIfPresent(from)
  if (text === undefined) return
  await Deno.mkdir(dirname(to), { recursive: true })
  await Deno.writeTextFile(to, text)
}

/** `timeout` signals the whole process group, so Stryker's workers stop with pnpm. */
const strykerUnderCap = async (name: string, shard: Shard | undefined, capSeconds: number): Promise<number> => {
  const { code } = await new Deno.Command('timeout', {
    args: [
      '--kill-after=60',
      String(capSeconds),
      'corepack',
      'pnpm',
      '--filter',
      name,
      'mutation',
      '--incrementalFile',
      incrementalFileOf(shard),
    ],
    env: { STRYKER_SHARD: shard === undefined ? '' : `${shard.index}/${shard.count}` },
    stdout: 'inherit',
    stderr: 'inherit',
  }).output()
  return code
}

/**
 * Runs the job's packages one at a time and stages what the Mutation workflow
 * uploads: `.timings/<job>.json`, `mutation-parts/`, `incremental/`.
 * A package that fails keeps its report check and never stops the next one.
 * Each package runs under `min(capSeconds, what is left of budgetSeconds)`, and
 * the timing part is rewritten after every package, so a job never reaches the
 * runner's timeout with nothing recorded. A package the budget no longer covers
 * does not run: it has no report and no timing, and the capped package ahead of
 * it records a lower bound that makes the next plan pack them apart.
 */
const runJob = async (job: Job, capSeconds: number, budgetSeconds: number): Promise<boolean> => {
  const shard = shardOfJob(job)
  const incrementalFile = incrementalFileOf(shard)
  const entries: Entry[] = []
  const jobStarted = Date.now()
  let ok = true
  for (const [position, name] of job.packages.entries()) {
    const dir = job.dirs[position]
    if (dir === undefined) throw new Error(`job ${job.id} names ${name} without a directory`)
    const started = Date.now()
    const cap = Math.min(capSeconds, budgetSeconds - Math.round((started - jobStarted) / 1000))
    const exitCode = cap > 0 ? await strykerUnderCap(name, shard, cap) : null
    if (exitCode === null) {
      console.log(`${name}: skipped, the job's ${budgetSeconds}s budget is spent`)
    } else {
      entries.push({
        package: name,
        seconds: Math.round((Date.now() - started) / 1000),
        exitCode,
        ...(shard === undefined ? {} : { shard }),
      })
      await Deno.mkdir('.timings', { recursive: true })
      await Deno.writeTextFile(
        join('.timings', `${job.id}.json`),
        JSON.stringify({ job: job.id, entries } satisfies Part),
      )
    }
    const outcome: Outcome = exitCode === 0 ? 'success' : 'failure'
    const reportsDir = join(dir, 'reports')
    const input = { package: labelOf(dir, shard), outcome, reportsDir, readFile: readText }
    console.log(await buildSummary(input))
    const missing = buildRequireError(input, await loadState(reportsDir, readText))
    if (missing !== null) {
      console.log(missing)
      ok = false
    }

    const part = join('mutation-parts', slugOf(dir), shard === undefined ? 'whole' : `${shard.index}of${shard.count}`)
    await Deno.mkdir(part, { recursive: true })
    await Deno.writeTextFile(
      join(part, 'mutation-part.json'),
      JSON.stringify({ package: dir, outcome, ...(shard === undefined ? {} : { shard }) } satisfies PartMeta),
    )
    await copyIfPresent(join(reportsDir, 'mutation', 'mutation.json'), join(part, 'mutation-report.json'))
    await copyIfPresent(join(reportsDir, 'mutation-stream.jsonl'), join(part, 'mutation-stream.jsonl'))
    await copyIfPresent(join(dir, incrementalFile), join('incremental', dir, incrementalFile))
  }
  return ok
}

const PositionSchema = Schema.Struct({ line: Schema.Number, column: Schema.Number })

/** One `mutant` line of a Stryker run's NDJSON stream, the verdict it records once a mutant settles. */
const StreamMutant = Schema.fromJsonString(Schema.Struct({
  _tag: Schema.Literal('mutant'),
  id: Schema.String,
  status: Schema.String,
  file: Schema.String,
  location: Schema.Struct({ start: PositionSchema, end: PositionSchema }),
  mutator: Schema.String,
  replacement: Schema.NullOr(Schema.String),
}))

/** Stryker's core format registry; a file a plugin format claims keeps its bare extension. */
const LANGUAGE_OF_EXTENSION: Readonly<Record<string, string>> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
}

const languageOf = (file: string): string => {
  const extension = extname(file).slice(1)
  return LANGUAGE_OF_EXTENSION[extension] ?? extension
}

/**
 * The files a shard that stopped before writing its report still recorded in
 * its stream, one entry per mutant id (a later line for the same id wins).
 * Source text is not on the stream, so these files carry an empty `source`.
 * A line that is not JSON (a torn tail) or not a mutant is skipped; a mutant
 * line that does not decode is counted, never dropped.
 */
const filesOfStream = (stream: string): { readonly files: Files; readonly undecoded: number } => {
  const lines = stream.split('\n').filter(isMutantLine)
  const events = lines.flatMap((line) => Option.toArray(Schema.decodeUnknownOption(StreamMutant)(line.trim())))
  const files = Object.fromEntries(
    [...Map.groupBy(events, (event) => event.file)].map(([file, settled]) => [file, {
      language: languageOf(file),
      source: '',
      mutants: [
        ...new Map(settled.map((event) => [event.id, {
          id: event.id,
          status: event.status,
          mutatorName: event.mutator,
          location: event.location,
          ...(event.replacement === null ? {} : { replacement: event.replacement }),
        }])).values(),
      ],
    }]),
  )
  return { files, undecoded: lines.length - events.length }
}

const filesOfPart = (dir: string, part: StagedPart): Files => {
  if (part.report !== undefined) return part.report.files
  const { files, undecoded } = filesOfStream(part.stream ?? '')
  if (undecoded > 0) {
    throw new Error(
      `${dir}: ${undecoded} mutant line(s) of a stream did not decode against the stream schema; ` +
        `merging would drop their verdicts.`,
    )
  }
  return files
}

/** The highest high, low and break any of `declared` sets, or undefined when none declares thresholds. */
const strictest = (declared: readonly Thresholds[]): Thresholds | undefined => {
  if (declared.length === 0) return undefined
  const breaks = declared.flatMap((thresholds) => typeof thresholds.break === 'number' ? [thresholds.break] : [])
  return {
    high: Math.max(...declared.map((thresholds) => thresholds.high)),
    low: Math.max(...declared.map((thresholds) => thresholds.low)),
    break: breaks.length === 0 ? null : Math.max(...breaks),
  }
}

/**
 * One report per package. Shards partition a package's files, so their reports
 * union into the package's report; a file two shards both mutated means the
 * partition broke, and the fold refuses it. A shard that staged no report gives
 * the verdicts its stream recorded, and its package is incomplete.
 */
const packageReports = (parts: readonly StagedPart[]): PackageReport[] =>
  [...Map.groupBy(parts, (part) => part.meta.package)].sort(([a], [b]) => a.localeCompare(b)).map(([dir, shards]) => {
    const expected = shards[0]?.meta.shard?.count ?? 1
    const sameCount = shards.every((part) => (part.meta.shard?.count ?? 1) === expected)
    const indices = new Set(shards.map((part) => part.meta.shard?.index ?? 1))
    const owners = new Map<string, number>()
    const files: Record<string, FileResult> = {}
    for (const part of shards) {
      for (const [file, result] of Object.entries(filesOfPart(dir, part))) {
        const other = owners.get(file)
        if (other !== undefined) {
          throw new Error(
            `${dir}: shards ${other} and ${part.meta.shard?.index} both mutated ${file}; ` +
              `shardMutate's file expansion missed a file Stryker's mutate patterns match.`,
          )
        }
        owners.set(file, part.meta.shard?.index ?? 1)
        files[file] = result
      }
    }
    const reports = shards.flatMap((part) => part.report === undefined ? [] : [part.report])
    const schemaVersion = reports[0]?.schemaVersion
    const thresholds = strictest(
      reports.flatMap((report) => report.thresholds === undefined ? [] : [report.thresholds]),
    )
    return {
      dir,
      outcome: shards.every((part) => part.meta.outcome === 'success') ? 'success' : 'failure',
      complete: sameCount && indices.size === expected && reports.length === shards.length,
      files,
      ...(schemaVersion === undefined ? {} : { schemaVersion }),
      ...(thresholds === undefined ? {} : { thresholds }),
    }
  })

/** `<package dir>/<file>`, so two packages' `src/index.ts` stay two keys. */
const repoPathOf = (dir: string, file: string): string =>
  `${dir}/${file}`.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.').join('/')

/** One report over every package, refusing a repo path two packages both name (a package nested in another). */
const mergedReport = (packages: readonly PackageReport[]): Report => {
  const owners = new Map<string, string>()
  const files: Record<string, FileResult> = {}
  for (const pkg of packages) {
    for (const [file, result] of Object.entries(pkg.files)) {
      const path = repoPathOf(pkg.dir, file)
      const other = owners.get(path)
      if (other !== undefined) {
        throw new Error(`${path} is reported by both ${other} and ${pkg.dir}; a merged report names each file once.`)
      }
      owners.set(path, pkg.dir)
      files[path] = result
    }
  }
  return {
    schemaVersion: packages.find((pkg) => pkg.schemaVersion !== undefined)?.schemaVersion ?? '1.0',
    thresholds: strictest(packages.flatMap((pkg) => pkg.thresholds === undefined ? [] : [pkg.thresholds])) ??
      DEFAULT_THRESHOLDS,
    files,
  }
}

const SURVIVOR_STATUSES: Record<string, true> = { Survived: true, NoCoverage: true }
const SURVIVOR_CAP = 100
const ABSENT_CELLS = ['-', '-', '-', '-', '-']
const VERDICT_OK = '[OK]'
const VERDICT_WARN = '[WARN]'
const VERDICT_FAIL = '[FAIL]'

type Row = {
  readonly label: string
  readonly score: string
  readonly cells: readonly string[]
  readonly thresholds: string
  readonly verdict: string
}

const mutantsOf = (files: Files): Mutant[] => Object.values(files).flatMap((file) => file.mutants)

const thresholdsCell = (thresholds: Thresholds | undefined): string =>
  thresholds === undefined ? '-' : `${thresholds.high}/${thresholds.low}/${thresholds.break ?? '-'}`

/** Stryker's grading: below break or low fails, below high warns, at or above high passes. */
const verdictOf = (percentage: number, thresholds: Thresholds): string => {
  const broken = typeof thresholds.break === 'number' && percentage < thresholds.break
  if (broken || percentage < thresholds.low) return VERDICT_FAIL
  return percentage < thresholds.high ? VERDICT_WARN : VERDICT_OK
}

const rowOf = (
  label: string,
  files: Files,
  outcome: Outcome,
  complete: boolean,
  thresholds: Thresholds | undefined,
): Row => {
  const mutants = mutantsOf(files)
  const count = (status: string): number => mutants.filter((mutant) => mutant.status === status).length
  const [killed, survived, noCoverage, timeout, compileErrors] = [
    count('Killed'),
    count('Survived'),
    count('NoCoverage'),
    count('Timeout'),
    count('CompileError'),
  ]
  const cells = [killed, survived, noCoverage, timeout, compileErrors].map(String)
  const shown = thresholdsCell(thresholds)
  const unfinished = outcome === 'success' ? VERDICT_WARN : VERDICT_FAIL
  if (!complete) return { label, score: 'incomplete', cells, thresholds: shown, verdict: unfinished }
  const valid = killed + timeout + survived + noCoverage
  if (valid === 0) return { label, score: 'n/a', cells, thresholds: shown, verdict: unfinished }
  const percentage = (killed + timeout) / valid * 100
  return {
    label,
    score: percentage.toFixed(2),
    cells,
    thresholds: shown,
    verdict: outcome === 'success' ? verdictOf(percentage, thresholds ?? DEFAULT_THRESHOLDS) : VERDICT_FAIL,
  }
}

/** A row for every package the plan named or a part reported; a planned package with no part has no report. */
const rowsOf = (packages: readonly PackageReport[], planned: readonly string[]): Row[] =>
  [...new Set([...planned, ...packages.map((pkg) => pkg.dir)])].sort().map((dir) => {
    const pkg = packages.find((candidate) => candidate.dir === dir)
    if (pkg === undefined || (!pkg.complete && Object.keys(pkg.files).length === 0)) {
      return { label: dir, score: 'no report', cells: ABSENT_CELLS, thresholds: '-', verdict: VERDICT_WARN }
    }
    return rowOf(dir, pkg.files, pkg.outcome, pkg.complete, pkg.thresholds)
  })

const summaryOf = (report: Report, packages: readonly PackageReport[], planned: readonly string[]): string => {
  const rows = rowsOf(packages, planned)
  const all = rowOf(
    '**all**',
    report.files,
    packages.every((pkg) => pkg.outcome === 'success') ? 'success' : 'failure',
    packages.every((pkg) => pkg.complete) && planned.every((dir) => packages.some((pkg) => pkg.dir === dir)),
    report.thresholds,
  )
  const survivors = Object.entries(report.files)
    .flatMap(([file, result]) =>
      result.mutants.filter((mutant) => SURVIVOR_STATUSES[mutant.status] === true).map((mutant) => ({ file, mutant }))
    )
    .sort((a, b) => a.file.localeCompare(b.file) || a.mutant.location.start.line - b.mutant.location.start.line)
  const survivorLines = survivors.slice(0, SURVIVOR_CAP).map(({ file, mutant }) =>
    `- \`${file}:${mutant.location.start.line}:${mutant.location.start.column}\` ${mutant.status} \`${mutant.mutatorName}\` -> \`${
      mutant.replacement ?? ''
    }\``
  )
  const overflow = survivors.length > SURVIVOR_CAP
    ? [`- and ${survivors.length - SURVIVOR_CAP} more; see mutation.json in the run artifact.`]
    : []
  return [
    '## Mutation',
    '',
    `Merged ${rows.filter((row) => row.score !== 'no report').length} of ${rows.length} package report(s).`,
    'Thresholds read high/low/break; each row is graded by its own, and **all** by the strictest of each.',
    '',
    '| package | score | killed | survived | no cov | timeout | compile err | thresholds | verdict |',
    '| --- | --: | --: | --: | --: | --: | --: | :-: | :-: |',
    ...[all, ...rows].map((row) =>
      `| ${row.label} | ${row.score} | ${row.cells.join(' | ')} | ${row.thresholds} | ${row.verdict} |`
    ),
    ...(survivors.length === 0 ? [] : ['', '### Survivors', '', ...survivorLines, ...overflow]),
  ].join('\n') + '\n'
}

/** Every package directory the plan gave a job, once. */
const plannedPackages = (jobs: readonly Job[]): string[] => [...new Set(jobs.flatMap((job) => job.dirs))].sort()

/** A staged `mutation-report.json`, refused with the part directory and the decoder's reason unless it is complete. */
const stagedReportOf = (dir: string, text: string): StagedReport => {
  const issue = reportIssue(text)
  if (issue !== null) {
    throw new Error(`${dir}: mutation-report.json is not a complete Stryker report, so it cannot merge: ${issue}`)
  }
  const parsed = JSON.parse(text) as { schemaVersion: string; files: Files; thresholds?: unknown }
  if (parsed.thresholds === undefined) return { schemaVersion: parsed.schemaVersion, files: parsed.files }
  const thresholds = Schema.decodeUnknownOption(ThresholdsSchema)(parsed.thresholds)
  if (Option.isNone(thresholds)) {
    throw new Error(`${dir}: mutation-report.json carries thresholds without a numeric high and low`)
  }
  return { schemaVersion: parsed.schemaVersion, files: parsed.files, thresholds: thresholds.value }
}

const readStagedParts = async (root: string): Promise<StagedPart[]> => {
  const parts: StagedPart[] = []
  for await (const marker of expandGlob('**/mutation-part.json', { root })) {
    const dir = dirname(marker.path)
    const report = await readIfPresent(join(dir, 'mutation-report.json'))
    const stream = await readIfPresent(join(dir, 'mutation-stream.jsonl'))
    parts.push({
      meta: JSON.parse(await Deno.readTextFile(marker.path)) as PartMeta,
      ...(report === undefined ? {} : { report: stagedReportOf(dir, report) }),
      ...(stream === undefined ? {} : { stream }),
    })
  }
  return parts
}

/** Writes `mutation.json` and `summary.md` into `out`, and appends the summary to $GITHUB_STEP_SUMMARY. */
const writeReport = async (out: string, parts: readonly StagedPart[], planned: readonly string[]): Promise<void> => {
  if (parts.length === 0) {
    throw new Error(`no mutation report parts were staged for the planned packages: ${planned.join(', ') || '(none)'}`)
  }
  const packages = packageReports(parts)
  const report = mergedReport(packages)
  const summary = summaryOf(report, packages, planned)
  await Deno.mkdir(out, { recursive: true })
  await Deno.writeTextFile(join(out, 'mutation.json'), JSON.stringify(report, null, 2))
  await Deno.writeTextFile(join(out, 'summary.md'), summary)
  const stepSummary = Deno.env.get('GITHUB_STEP_SUMMARY')
  if (stepSummary !== undefined && stepSummary !== '') await Deno.writeTextFile(stepSummary, summary, { append: true })
  console.log(summary)
}

const main = async (): Promise<void> => {
  const [command, ...rest] = Deno.args
  const args = parseArgs(rest, { string: ['cap-seconds', 'budget-seconds', 'parts', 'out'] })
  if (command === 'run') {
    const job = JSON.parse(Deno.env.get('JOB') ?? 'null') as Job | null
    if (job === null) throw new Error('run needs JOB, one job from `test-timings.ts plan --task mutation`')
    if (args['cap-seconds'] === undefined || args['budget-seconds'] === undefined) {
      throw new Error('run needs --cap-seconds and --budget-seconds')
    }
    if (!await runJob(job, Number(args['cap-seconds']), Number(args['budget-seconds']))) Deno.exit(1)
    return
  }
  if (command === 'report') {
    if (args.parts === undefined || args.out === undefined) throw new Error('report needs --parts and --out')
    const jobs = JSON.parse(Deno.env.get('JOBS') ?? '[]') as Job[]
    await writeReport(args.out, await readStagedParts(args.parts), plannedPackages(jobs))
    return
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected run or report`)
}

if (import.meta.main) await main()
