/**
 * Turning a run's results into reports — file reports, stdout summaries, and
 * the machine-mode progress stream.
 *
 * Two outputs share one shape: a pure decision (what to write) and an impure
 * edge (where to write it). The decision lives in `Reporter.workflow.ts` so
 * `Workflow.make` stays behind its gate; the edge — `FileSystem`, `Path`,
 * `process.stdout`, and the `ReporterService` dispatcher — lives here.
 * Progress tracking is split the same way: `ProgressTally` is the state,
 * `progress-bar` formatting is the view, and the three reporter factories
 * (`clear-text`, `json`, `progress`) are the wiring that the engine selects
 * via `selectReporters` and fans out through `MutationReporting`.
 */

import os from 'os'
import { pathToFileURL } from 'url'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { type CheckResult, type CheckStatus, type PassedCheckResult } from '@systemfsoftware/stryker-js/Checker'
import type {
  Location,
  MutantResult,
  MutantStatus,
  MutantTestCoverage,
  Position,
} from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type { AnyPluginContribution, PluginKind } from '@systemfsoftware/stryker-js/Plugin'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
  ReporterService,
  RunTiming,
} from '@systemfsoftware/stryker-js/Reporter'
import { broadcastReporter, ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import { RunEvents, VerdictReached } from '@systemfsoftware/stryker-js/Run'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type { MutantRunResult, TestResult } from '@systemfsoftware/stryker-js/TestRunner'
import type { TestRunnerCapabilities } from '@systemfsoftware/stryker-js/TestRunner'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import type * as schema from 'mutation-testing-report-schema/api'
import type { OpenEndLocation } from 'mutation-testing-report-schema/api'

import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { verdictExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { JsonDocument, JsonReportCommand, JsonReportError, makeJsonDocument } from './JsonReport.workflow.js'
import type { TestCoverage } from './Mutants.js'
import type { ResolvedMode } from './output-mode.js'
import type { Project } from './Project.js'
import { readOriginal } from './Project.js'
import {
  ClearTextDocument,
  ClearTextReportCommand,
  ClearTextReportError,
  makeClearTextDocument,
} from './Reporter.workflow.js'
import type { RunOutcome } from './Run.js'
import { strykerVersion } from './stryker-package.js'
import { buildVerdictEnvelope, isActionableStatus } from './verdict-envelope.js'
const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')
type ProvidedStrykerOptions = StrykerOptions
const writeOutputFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  fileName: string,
  content: string,
): Effect.Effect<void, PlatformError, never> =>
  Effect.gen(function*() {
    yield* fs.makeDirectory(path.dirname(fileName), { recursive: true })
    yield* fs.writeFileString(fileName, content)
  })

// ─── re-export broadcast / strict for callers that imported via reporting/ ──

export { broadcastReporter }
export type { NamedReporter } from '@systemfsoftware/stryker-js/Reporter'
export type StrictReporter = ReporterService

// ═══════════════════════════════════════════════════════════════════════════
// Progress bar — view over ProgressTally ticks
// ═══════════════════════════════════════════════════════════════════════════

export type ProgressBarState = {
  readonly format: string
  readonly total: number
  readonly curr: number
  readonly width: number
  readonly complete: string
  readonly incomplete: string
}

export const makeProgressBarState = (
  format: string,
  options: {
    readonly complete: string
    readonly incomplete: string
    readonly total: number
    readonly width: number
  },
): ProgressBarState => ({
  format,
  total: options.total,
  curr: 0,
  width: options.width,
  complete: options.complete,
  incomplete: options.incomplete,
})

export const tickProgressBar = (
  state: ProgressBarState,
  ticks: number,
): ProgressBarState => ({
  ...state,
  curr: state.curr + ticks,
})

export const renderProgressBar = (
  state: ProgressBarState,
  data: Readonly<Record<string, string | number>>,
): string =>
  formatBar(state.format, state.curr, state.total, data, {
    width: state.width,
    complete: state.complete,
    incomplete: state.incomplete,
  })

export const isComplete = (state: ProgressBarState): boolean => state.curr >= state.total

function formatBar(
  format: string,
  curr: number,
  total: number,
  data: Readonly<Record<string, string | number>>,
  options: { readonly width: number; readonly complete: string; readonly incomplete: string },
): string {
  let ratio = 0
  if (total !== 0) {
    ratio = Math.min(curr / total, 1)
  }
  const filled = Math.floor(ratio * options.width)
  const bar = options.complete.repeat(filled) + options.incomplete.repeat(options.width - filled)
  const percent = `${Math.floor(ratio * 100).toString().padStart(3, ' ')}%`
  let out = format
  out = out.replace(':bar', bar)
  out = out.replace(':percent', percent)
  for (const [k, v] of Object.entries(data)) {
    out = out.replaceAll(`:${k}`, String(v))
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Progress keeper — tally over DryRun / Plan / MutantTested events
// ═══════════════════════════════════════════════════════════════════════════

export type ProgressTally = {
  readonly survived: number
  readonly timedOut: number
  readonly tested: number
  readonly mutants: number
  readonly total: number
  readonly ticks: number
  readonly ticksByMutantId: ReadonlyMap<string, number>
  readonly timing: RunTiming
  readonly capabilities: TestRunnerCapabilities
  readonly startedAt: number
}

export const emptyTally = (startedAt: number): ProgressTally => ({
  survived: 0,
  timedOut: 0,
  tested: 0,
  mutants: 0,
  total: 0,
  ticks: 0,
  ticksByMutantId: new Map<string, number>(),
  timing: { net: 0, overhead: 0 },
  capabilities: { reloadEnvironment: false },
  startedAt,
})

export const handleDryRunCompleted = (
  tally: ProgressTally,
  event: DryRunCompletedEvent,
): ProgressTally => ({
  ...tally,
  timing: event.timing,
  capabilities: event.capabilities,
})

export const handleMutationTestingPlanReady = (
  tally: ProgressTally,
  event: MutationTestingPlanReadyEvent,
  startedAt: number,
): ProgressTally => {
  const map = new Map<string, number>()
  for (const plan of event.mutantPlans) {
    if (plan.plan !== 'Run') continue
    let ticks = plan.netTime
    if (
      tally.capabilities.reloadEnvironment === false &&
      plan.runOptions.reloadEnvironment
    ) {
      ticks += tally.timing.overhead
    }
    map.set(plan.mutant.id, ticks)
  }
  const total = [...map.values()].reduce((acc, n) => acc + n, 0)
  return {
    ...tally,
    startedAt,
    ticksByMutantId: map,
    mutants: map.size,
    total,
  }
}

export const handleMutantTested = (
  tally: ProgressTally,
  result: MutantResult,
): { readonly tally: ProgressTally; readonly ticks: number } => {
  const ticks = tally.ticksByMutantId.get(result.id)
  if (ticks === undefined) {
    return { tally, ticks: 0 }
  }
  let survived = tally.survived
  if (result.status === 'Survived') {
    survived = tally.survived + 1
  }
  let timedOut = tally.timedOut
  if (result.status === 'Timeout') {
    timedOut = tally.timedOut + 1
  }
  const next: ProgressTally = {
    ...tally,
    tested: tally.tested + 1,
    ticks: tally.ticks + ticks,
    survived,
    timedOut,
  }
  return { tally: next, ticks }
}

export const getElapsedTime = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  return formatTime(elapsed)
}

export const getEtc = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  const totalSecondsLeft = Math.floor(
    (elapsed / tally.ticks) * (tally.total - tally.ticks),
  )
  if (Number.isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
    return formatTime(totalSecondsLeft)
  }
  return 'n/a'
}

function formatTime(timeInSeconds: number): string {
  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  if (hours > 0) {
    return `~${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `~${minutes}m`
  }
  return '<1m'
}

// ═══════════════════════════════════════════════════════════════════════════
// Clear-text reporter — stdout + debug via Cell pipeline
// ═══════════════════════════════════════════════════════════════════════════

interface ClearTextReportPhases extends Cell.Phases {
  readonly command: void
  readonly raw: { readonly report: unknown; readonly metrics: unknown; readonly options: unknown }
  readonly decoded: ClearTextReportCommand
  readonly decision: ClearTextDocument
  readonly decisionError: ClearTextReportError
  readonly output: { readonly stdout: ReadonlyArray<string>; readonly debug: ReadonlyArray<string> }
  readonly response: void
  readonly decodeError: unknown
  readonly readError: PlatformError
  readonly writeError: PlatformError
}

export const makeClearTextReporter = (params: {
  readonly options?: ProvidedStrykerOptions
  readonly out?: NodeJS.WritableStream
}): ReporterService => {
  const options = params.options
  const out = params.out ?? process.stdout

  let heldReport: schema.MutationTestResult | undefined
  let heldMetrics: MutationTestMetricsResult | undefined

  const clearTextDescription: Cell.WriteDone<ClearTextReportPhases> = pipe(
    Cell.read<ClearTextReportPhases>(() => Effect.succeed({ report: heldReport, metrics: heldMetrics, options })),
    Cell.decode<ClearTextReportPhases>((raw) =>
      S.decodeUnknownResult(ClearTextReportCommand)({ report: raw.report, metrics: raw.metrics, options: raw.options })
    ),
    Cell.decide<ClearTextReportPhases>(makeClearTextDocument),
    Cell.encode<ClearTextReportPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: () => ({ stdout: [] satisfies ReadonlyArray<string>, debug: [] satisfies ReadonlyArray<string> }),
        onSuccess: (doc) => ({ stdout: doc.stdout, debug: doc.debug }),
      })
    ),
    Cell.write<ClearTextReportPhases>((output) =>
      Effect.gen(function*() {
        for (const line of output.stdout) {
          out.write(`${line}${os.EOL}`)
        }
        for (const line of output.debug) {
          yield* Effect.logDebug(line)
        }
      })
    ),
  )

  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,
    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,
    onMutantTested: (_result: MutantResult) => Effect.void,
    onMutationTestReportReady: (report: schema.MutationTestResult, metrics: MutationTestMetricsResult) =>
      Effect.gen(function*() {
        if (options === undefined) return
        heldReport = report
        heldMetrics = metrics
        yield* Cell.apply(clearTextDescription, undefined)
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.fail(
            new ReporterFailed({
              reporterName: 'clear-text',
              event: 'onMutationTestReportReady',
              cause: errorToString(cause),
            }),
          )
        ),
      ),
    wrapUp: Effect.void,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON reporter — file report via Cell pipeline
// ═══════════════════════════════════════════════════════════════════════════

interface JsonReportPhases extends Cell.Phases {
  readonly command: void
  readonly raw: { readonly report: unknown }
  readonly decoded: JsonReportCommand
  readonly decision: JsonDocument
  readonly decisionError: JsonReportError
  readonly output: string
  readonly response: void
  readonly decodeError: unknown
  readonly readError: PlatformError
  readonly writeError: PlatformError
}

export const makeJsonReporter = (params: {
  readonly options?: ProvidedStrykerOptions
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}): ReporterService => {
  const options = params.options
  const fs = params.fs
  const path = params.path

  let heldReport: schema.MutationTestResult | undefined

  const jsonReportDescription: Cell.WriteDone<JsonReportPhases> = pipe(
    Cell.read<JsonReportPhases>(() => {
      const raw: { readonly report: unknown } = { report: heldReport }
      return Effect.succeed(raw)
    }),
    Cell.decode<JsonReportPhases>((raw) => S.decodeUnknownResult(JsonReportCommand)({ report: raw.report })),
    Cell.decide<JsonReportPhases>(makeJsonDocument),
    Cell.encode<JsonReportPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: () => '',
        onSuccess: (doc) => doc.json,
      })
    ),
    Cell.write<JsonReportPhases>((json) =>
      Effect.gen(function*() {
        if (options === undefined) return
        const filePath = path.normalize(options.jsonReporter.fileName)
        yield* Effect.logDebug(`Using relative path ${filePath}`)
        yield* writeOutputFile(fs, path, path.resolve(filePath), json)
        yield* Effect.logInfo(`Your report can be found at: ${pathToFileURL(filePath).href}`)
      })
    ),
  )

  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,
    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,
    onMutantTested: (_result: MutantResult) => Effect.void,
    onMutationTestReportReady: (report: schema.MutationTestResult, _metrics: MutationTestMetricsResult) =>
      Effect.gen(function*() {
        if (options === undefined) return
        heldReport = report
        yield* Cell.apply(jsonReportDescription, undefined)
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.fail(
            new ReporterFailed({
              reporterName: 'json',
              event: 'onMutationTestReportReady',
              cause: errorToString(cause),
            }),
          )
        ),
      ),
    wrapUp: Effect.void,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Progress bar reporter — terminal bar onMutantTested
// ═══════════════════════════════════════════════════════════════════════════

export const makeProgressBarReporter = (params: {
  readonly out?: NodeJS.WritableStream
  readonly barFormat?: string
  readonly barOptions?: {
    readonly complete: string
    readonly incomplete: string
    readonly width: number
  }
} = {}): Effect.Effect<ReporterService> =>
  Effect.gen(function*() {
    const out = params.out ?? process.stdout
    const barFormat = params.barFormat ??
      'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:mutants Mutants tested (:survived survived, :timedOut timed out)'
    const barOptions = params.barOptions ?? { complete: '=', incomplete: ' ', width: 50 }
    const tallyRef = yield* Ref.make<ProgressTally>(emptyTally(0))
    const barRef = yield* Ref.make<ProgressBarState | undefined>(undefined)

    const reporter: ReporterService = {
      onDryRunCompleted: (event: DryRunCompletedEvent) =>
        Ref.update(tallyRef, (tally) => handleDryRunCompleted(tally, event)).pipe(
          Effect.mapError(
            (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onDryRunCompleted', cause }),
          ),
        ),
      onMutationTestingPlanReady: (event: MutationTestingPlanReadyEvent) =>
        Effect.gen(function*() {
          const startedAt = yield* Clock.currentTimeMillis
          yield* Ref.update(tallyRef, (tally) => handleMutationTestingPlanReady(tally, event, startedAt))
          const tally = yield* Ref.get(tallyRef)
          const barState = makeProgressBarState(barFormat, {
            complete: barOptions.complete,
            incomplete: barOptions.incomplete,
            total: tally.total,
            width: barOptions.width,
          })
          yield* Ref.set(barRef, barState)
        }).pipe(
          Effect.mapError(
            (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onMutationTestingPlanReady', cause }),
          ),
        ),

      onMutantTested: (result: MutantResult) =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          const tally = yield* Ref.get(tallyRef)
          const { tally: nextTally, ticks } = handleMutantTested(tally, result)
          yield* Ref.set(tallyRef, nextTally)
          const barState = yield* Ref.get(barRef)
          if (barState === undefined) return
          let nextBar = barState
          if (ticks !== 0) {
            nextBar = tickProgressBar(barState, ticks)
          }
          yield* Ref.set(barRef, nextBar)
          const data: Record<string, string | number> = {
            survived: nextTally.survived,
            timedOut: nextTally.timedOut,
            tested: nextTally.tested,
            mutants: nextTally.mutants,
            total: nextTally.total,
            ticks: nextTally.ticks,
            et: getElapsedTime(nextTally, now),
            etc: getEtc(nextTally, now),
          }
          const line = renderProgressBar(nextBar, data)
          yield* Effect.sync(() => {
            out.write(`\r${line}`)
            if (isComplete(nextBar)) {
              out.write('\n')
            }
          })
        }).pipe(
          Effect.mapError(
            (cause) => new ReporterFailed({ reporterName: 'progress', event: 'onMutantTested', cause }),
          ),
        ),

      onMutationTestReportReady: (
        _report: schema.MutationTestResult,
        _metrics: MutationTestMetricsResult,
      ) => Effect.void,

      wrapUp: Effect.void,
    }

    return reporter
  })

// ═══════════════════════════════════════════════════════════════════════════
// Progress stream reporter — NDJSON run events for machine mode
// ═══════════════════════════════════════════════════════════════════════════

export type RunEvent =
  | { kind: 'plan'; total: number }
  | {
    kind: 'mutant'
    id: string
    status: string
    file: string
    location: schema.Location
    mutator: string
    replacement: string | null
    completed: number
    total: number
  }

export type RunEventSink = (event: RunEvent) => void

export function filterActionable(result: MutantResult): boolean {
  return isActionableStatus(result.status)
}

export function toRunEvent(
  result: MutantResult,
  completed: number,
  total: number,
): RunEvent {
  return {
    kind: 'mutant',
    id: result.id,
    status: result.status,
    file: result.fileName,
    location: result.location,
    mutator: result.mutatorName,
    replacement: result.replacement,
    completed,
    total,
  }
}

export const makeProgressStreamReporter = (
  runEventSink: RunEventSink = () => {},
): Effect.Effect<ReporterService> =>
  Effect.gen(function*() {
    const totalRef = yield* Ref.make(0)
    const completedRef = yield* Ref.make(0)

    const reporter: ReporterService = {
      onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,

      onMutationTestingPlanReady: (event: MutationTestingPlanReadyEvent) =>
        Effect.gen(function*() {
          const total = event.mutantPlans.length
          yield* Ref.set(totalRef, total)
          yield* Effect.try({
            try: () => {
              runEventSink({ kind: 'plan', total })
            },
            catch: (cause) =>
              new ReporterFailed({
                reporterName: 'progress-stream',
                event: 'onMutationTestingPlanReady',
                cause: errorToString(cause),
              }),
          })
        }),

      onMutantTested: (result: MutantResult) =>
        Effect.gen(function*() {
          const completed = yield* Ref.updateAndGet(completedRef, (n) => n + 1)
          if (!isActionableStatus(result.status)) {
            return
          }
          const total = yield* Ref.get(totalRef)
          yield* Effect.try({
            try: () => {
              runEventSink({
                kind: 'mutant',
                id: result.id,
                status: result.status,
                file: result.fileName,
                location: result.location,
                mutator: result.mutatorName,
                replacement: result.replacement,
                completed,
                total,
              })
            },
            catch: (cause) =>
              new ReporterFailed({
                reporterName: 'progress-stream',
                event: 'onMutantTested',
                cause: errorToString(cause),
              }),
          })
        }),

      onMutationTestReportReady: (
        _report: schema.MutationTestResult,
        _metrics: MutationTestMetricsResult,
      ) => Effect.void,

      wrapUp: Effect.void,
    }

    return reporter
  })

// ─── re-export render helpers from workflow for external callers ─────────

export {
  ansi,
  buildJsonReport,
  colorEnabled,
  drawClearTextScoreTable,
  getEmojiForStatus,
  plural,
  renderClearText,
  renderClearTextString,
  stringWidth,
} from './Reporter.workflow.js'
export type { Column } from './Reporter.workflow.js'

// ═══════════════════════════════════════════════════════════════════════════
// Report location — 0-based run positions <-> 1-based schema positions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Positions cross the report boundary in both directions, so both conversions
 * live here. They were split across two modules - the encode half beside the
 * result mapping, the decode half beside file selection - which put the two
 * halves of one correspondence out of each other's sight.
 *
 * Encoding adds one to each axis: a run counts lines and columns from zero, the
 * report schema counts from one.
 */
export const toSchemaPosition = (pos: Position): schema.Position => ({
  column: pos.column + 1,
  line: pos.line + 1,
})

export const toSchemaLocation = (location: Location): schema.Location => ({
  start: toSchemaPosition(location.start),
  end: toSchemaPosition(location.end),
})

/**
 * Decoding rebuilds the position from its two axes, dropping whatever else the
 * report carried on the object.
 */
function reportPositionToStrykerPosition({ line, column }: Position): Position {
  return { line, column }
}

export function reportOpenEndLocationToStrykerLocation({ start, end }: OpenEndLocation): OpenEndLocation {
  if (end === undefined) {
    return { start: reportPositionToStrykerPosition(start) }
  }
  return {
    start: reportPositionToStrykerPosition(start),
    end: reportPositionToStrykerPosition(end),
  }
}

export function reportLocationToStrykerLocation({ start, end }: Location): Location {
  return {
    start: reportPositionToStrykerPosition(start),
    end: reportPositionToStrykerPosition(end),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Report mapping — check/run results -> MutantResult + report helpers
// ═══════════════════════════════════════════════════════════════════════════

export const checkStatusToMutantStatus = (
  _status: Exclude<CheckStatus, 'passed'>,
): MutantStatus => 'CompileError'
export const mapCheckResult = (
  mutant: MutantTestCoverage,
  result: Exclude<CheckResult, PassedCheckResult>,
): MutantResult => ({
  _tag: 'Mutant',
  id: mutant.id,
  fileName: mutant.fileName,
  mutatorName: mutant.mutatorName,
  replacement: mutant.replacement,
  location: toSchemaLocation(mutant.location),
  status: checkStatusToMutantStatus(result.status),
  statusReason: result.reason,
  coveredBy: mutant.coveredBy,
  static: mutant.static,
  testsCompleted: mutant.testsCompleted,
  description: mutant.description,
})

export const mapRunResult = (mutant: MutantTestCoverage, result: MutantRunResult): MutantResult => {
  const location = toSchemaLocation(mutant.location)
  switch (result.status) {
    case 'error': {
      return {
        _tag: 'Mutant',
        id: mutant.id,
        fileName: mutant.fileName,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        location,
        status: 'RuntimeError',
        statusReason: result.errorMessage,
        coveredBy: mutant.coveredBy,
        static: mutant.static,
        testsCompleted: mutant.testsCompleted,
        description: mutant.description,
      }
    }
    case 'killed': {
      return {
        _tag: 'Mutant',
        id: mutant.id,
        fileName: mutant.fileName,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        location,
        status: 'Killed',
        testsCompleted: result.nrOfTests,
        killedBy: [...result.killedBy],
        statusReason: result.failureMessage,
        coveredBy: mutant.coveredBy,
        static: mutant.static,
        description: mutant.description,
      }
    }
    case 'timeout': {
      const base: MutantResult = {
        _tag: 'Mutant',
        id: mutant.id,
        fileName: mutant.fileName,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        location,
        status: 'Timeout',
        coveredBy: mutant.coveredBy,
        static: mutant.static,
        testsCompleted: mutant.testsCompleted,
        description: mutant.description,
      }
      if (result.reason !== undefined) {
        return {
          _tag: 'Mutant',
          id: base.id,
          fileName: base.fileName,
          mutatorName: base.mutatorName,
          replacement: base.replacement,
          location: base.location,
          status: base.status,
          statusReason: result.reason,
          coveredBy: base.coveredBy,
          static: base.static,
          testsCompleted: base.testsCompleted,
          description: base.description,
        }
      }
      return base
    }
    case 'survived': {
      return {
        _tag: 'Mutant',
        id: mutant.id,
        fileName: mutant.fileName,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        location,
        status: 'Survived',
        testsCompleted: result.nrOfTests,
        coveredBy: mutant.coveredBy,
        static: mutant.static,
        description: mutant.description,
      }
    }
  }
}

export const determineLanguage = (name: string, pathService: Path.Path): string => {
  const ext = pathService.extname(name).toLowerCase()
  switch (ext) {
    case '.ts':
    case '.tsx': {
      return 'typescript'
    }
    case '.html':
    case '.vue': {
      return 'html'
    }
    default: {
      return 'javascript'
    }
  }
}

export const normalizeReportFileName = (
  basePath: string,
  fileName: string | undefined,
  pathService: Path.Path,
): string => {
  if (fileName !== undefined && fileName !== '') {
    return normalizeFileName(pathService.relative(basePath, fileName))
  }
  return ''
}

// ═══════════════════════════════════════════════════════════════════════════
// Reporter selection — which reporters may run, given the output mode
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Which reporters may run, given the output mode.
 *
 * Machine mode keeps stdout exclusively for the NDJSON stream, so a reporter
 * that writes prose there cannot run: a progress bar or a score table
 * interleaved into the protocol makes every line after it unparseable, and the
 * consumer has no way to tell the difference between that and a malformed run.
 * The file reporters are unaffected — they write to disk, never to stdout, and a
 * machine consumer wants their output.
 *
 * Human mode has no NDJSON channel, so the `progress-stream` reporter is inert
 * and the human reporter `clear-text` runs instead. The substitution preserves
 * the user's other reporters (`html`, `json`, …) and their order, and is
 * idempotent.
 *
 * This is the ONLY gate on reporter selection by mode. The alternative, letting
 * each reporter decide whether to render, puts the same decision in as many
 * places as there are reporters and lets them disagree; and a reporter that
 * renders nothing is indistinguishable from one that failed.
 */
const STDOUT_REPORTERS: ReadonlySet<string> = new Set(['clear-text', 'progress'])

/** The reporter that carries the machine protocol. Inert in human mode. */
const STREAM_REPORTER = 'progress-stream'

/** The human reporter that renders the score table and mutant details. */
const HUMAN_REPORTER = 'clear-text'

/**
 * Narrows the configured reporter list to those the mode permits.
 *
 * Pure: names in, names out. Order is preserved so a consumer reading the
 * resolved options sees its own list, minus what the mode forbids.
 * Human mode substitutes `progress-stream` -> `clear-text`, deduplicated to
 * keep the operation idempotent.
 */
export function selectReporters(
  configured: readonly string[],
  mode: 'human' | 'machine',
): readonly string[] {
  if (mode === 'human') {
    const mapped = configured.map((name) => {
      if (name === STREAM_REPORTER) {
        return HUMAN_REPORTER
      }
      return name
    })
    const seen = new Set<string>()
    const result: string[] = []
    for (const name of mapped) {
      if (!seen.has(name)) {
        seen.add(name)
        result.push(name)
      }
    }
    return result
  }
  const permitted = configured.filter((name) => !STDOUT_REPORTERS.has(name))
  if (permitted.includes(STREAM_REPORTER)) {
    return permitted
  }
  return [...permitted, STREAM_REPORTER]
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutation reporting — collects results, builds report, fans out to reporters
// ═══════════════════════════════════════════════════════════════════════════

const STRYKER_FRAMEWORK: Readonly<Pick<schema.FrameworkInformation, 'branding' | 'name' | 'version'>> = Object.freeze({
  branding: {
    homepageUrl: 'https://stryker-mutator.io',
    imageUrl: 'https://stryker-mutator.io/assets/images/stryker-80x80.png',
  },
  name: 'StrykerJS',
  version: strykerVersion,
})

export interface MutationReportingService {
  readonly reportCheckFailure: (
    mutant: MutantTestCoverage,
    result: Exclude<CheckResult, PassedCheckResult>,
  ) => Effect.Effect<MutantResult, unknown>
  readonly reportMutantRunResult: (
    mutant: MutantTestCoverage,
    result: MutantRunResult,
  ) => Effect.Effect<MutantResult, unknown>
  readonly reportAll: (
    results: readonly MutantResult[],
  ) => Effect.Effect<RunOutcome, unknown, FileSystem.FileSystem | Path.Path | RunEvents>
}

export class MutationReporting extends Context.Service<MutationReporting, MutationReportingService>()(
  'MutationReporting',
) {}

export interface MakeMutationReportingInput {
  readonly reporter: ReporterService
  readonly options: StrykerOptions
  readonly project: Project
  readonly testCoverage: TestCoverage
  readonly runId: string
  readonly resolvedMode: ResolvedMode
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>
  readonly sandboxDirectory: string
  readonly basePath: string
}

export const makeMutationReportingService = (input: MakeMutationReportingInput): MutationReportingService => {
  const reportOne = (result: MutantResult): Effect.Effect<MutantResult, unknown> =>
    input.reporter.onMutantTested(result).pipe(Effect.as(result))
  const reportMutantStatus = (
    mutant: MutantTestCoverage,
    status: MutantResult['status'],
  ): Effect.Effect<MutantResult, unknown> => {
    const location = toSchemaLocation(mutant.location)
    return reportOne({
      _tag: 'Mutant',
      id: mutant.id,
      fileName: mutant.fileName,
      mutatorName: mutant.mutatorName,
      replacement: mutant.replacement,
      location,
      status,
      coveredBy: mutant.coveredBy,
      static: mutant.static,
      testsCompleted: mutant.testsCompleted,
      description: mutant.description,
      statusReason: mutant.statusReason,
    })
  }

  const reportCheckFailure: MutationReportingService['reportCheckFailure'] = (mutant, result) =>
    reportMutantStatus(mutant, checkStatusToMutantStatus(result.status))

  const reportMutantRunResult: MutationReportingService['reportMutantRunResult'] = (mutant, result) => {
    const mapped = mapRunResult(mutant, result)
    return reportOne(mapped)
  }

  const toTestDefinition = (test: TestResult, remapTestId: (id: string) => string): schema.TestDefinition => {
    const base: schema.TestDefinition = {
      id: remapTestId(test.id),
      name: test.name,
    }
    if (test.startPosition !== undefined) {
      return {
        ...base,
        location: { start: toSchemaPosition(test.startPosition) },
      }
    }
    return base
  }

  const toMutantResult = (
    mutantResult: MutantResult,
    remapTestIds: (ids: readonly string[] | undefined) => readonly string[] | undefined,
  ): schema.MutantResult => {
    const remappedKilledBy = remapTestIds(mutantResult.killedBy)
    const remappedCoveredBy = remapTestIds(mutantResult.coveredBy)
    const result: schema.MutantResult = {
      id: mutantResult.id,
      mutatorName: mutantResult.mutatorName,
      replacement: mutantResult.replacement,
      status: mutantResult.status,
      location: mutantResult.location,
    }
    if (mutantResult.statusReason !== undefined) {
      result.statusReason = mutantResult.statusReason
    }
    if (mutantResult.testsCompleted !== undefined) {
      result.testsCompleted = mutantResult.testsCompleted
    }
    if (mutantResult.description !== undefined) {
      result.description = mutantResult.description
    }
    if (mutantResult.static !== undefined) {
      result.static = mutantResult.static
    }
    if (remappedKilledBy !== undefined) {
      result.killedBy = [...remappedKilledBy]
    }
    if (remappedCoveredBy !== undefined) {
      result.coveredBy = [...remappedCoveredBy]
    }
    return result
  }

  const toFileResult = (
    fileName: string,
  ): Effect.Effect<schema.FileResult, unknown, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const fileResult: schema.FileResult = {
        language: determineLanguage(fileName, pathService),
        mutants: [],
        source: '',
      }
      const sourceOpt = MutableHashMap.get(input.project.files, fileName)
      if (Option.isSome(sourceOpt)) {
        fileResult.source = yield* readOriginal(sourceOpt.value)
      } else {
        yield* Effect.logWarning(
          `File "${fileName}" not found in input files, but did receive mutant result for it. This shouldn't happen`,
        )
      }
      return fileResult
    })

  const toTestFile = (
    fileName: string | undefined,
  ): Effect.Effect<schema.TestFile, unknown, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const testFile: schema.TestFile = { tests: [] }
      if (fileName !== undefined && fileName !== '') {
        const fileOpt = MutableHashMap.get(input.project.files, fileName)
        if (Option.isSome(fileOpt)) {
          testFile.source = yield* readOriginal(fileOpt.value)
        } else {
          yield* Effect.logWarning(
            `Test file "${fileName}" not found in input files, but did receive test result for it. This shouldn't happen.`,
          )
        }
      }
      return testFile
    })

  const toFileResults = (
    results: readonly MutantResult[],
    remapTestIds: (ids: readonly string[] | undefined) => readonly string[] | undefined,
  ): Effect.Effect<schema.FileResultDictionary, unknown, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const uniqueFileNames = results
        .map(({ fileName }) => fileName)
        .filter((value, index, array) => array.indexOf(value) === index)
      const entries = yield* Effect.forEach(
        uniqueFileNames,
        (fileName) => toFileResult(fileName).pipe(Effect.map((result) => [fileName, result] as const)),
        { concurrency: 'unbounded' },
      )
      const fileResultsByName: Record<string, schema.FileResult> = Object.fromEntries(entries)

      return results.reduce<schema.FileResultDictionary>((acc, mutantResult) => {
        const reportFileName = normalizeReportFileName(input.basePath, mutantResult.fileName, pathService)
        let fileResult = acc[reportFileName]
        if (fileResult === undefined) {
          const prepared = fileResultsByName[mutantResult.fileName]
          if (prepared === undefined) {
            return acc
          }
          acc[reportFileName] = prepared
          fileResult = prepared
        }
        fileResult.mutants.push(toMutantResult(mutantResult, remapTestIds))
        return acc
      }, {})
    })

  const toTestFiles = (
    remapTestId: (id: string) => string,
  ): Effect.Effect<schema.TestFileDefinitionDictionary, unknown, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const uniqueTestFileNames = [...MutableHashMap.values(input.testCoverage.testsById)]
        .map(({ fileName }) => fileName)
        .filter((value, index, array) => array.indexOf(value) === index)
        .filter((value): value is string => value !== undefined)
      const mapped = uniqueTestFileNames.map((fileName) =>
        normalizeReportFileName(input.basePath, fileName, pathService)
      )
      const entries = yield* Effect.forEach(
        uniqueTestFileNames,
        (fileName, index) => toTestFile(fileName).pipe(Effect.map((file) => [mapped[index] ?? '', file] as const)),
        { concurrency: 'unbounded' },
      )
      const testFilesByName: Record<string, schema.TestFile> = Object.fromEntries(entries)

      return [...MutableHashMap.values(input.testCoverage.testsById)].reduce<schema.TestFileDefinitionDictionary>(
        (acc, testResult) => {
          const test = toTestDefinition(testResult, remapTestId)
          const reportFileName = normalizeReportFileName(input.basePath, testResult.fileName, pathService)
          let testFile = acc[reportFileName]
          if (testFile === undefined) {
            const prepared = testFilesByName[reportFileName]
            if (prepared === undefined) {
              return acc
            }
            acc[reportFileName] = prepared
            testFile = prepared
          }
          testFile.tests.push(test)
          return acc
        },
        {},
      )
    })

  const mutationTestReport = (
    results: readonly MutantResult[],
  ): Effect.Effect<schema.MutationTestResult, unknown, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function*() {
      const testIdMap: Record<string, string> = Object.fromEntries(
        [...MutableHashMap.values(input.testCoverage.testsById)].map((test, index) => {
          const pair: readonly [string, string] = [test.id, index.toString()]
          return pair
        }),
      )
      const remapTestId = (id: string): string => testIdMap[id] ?? id
      const remapTestIds = (ids: readonly string[] | undefined): readonly string[] | undefined => {
        if (ids === undefined) {
          return undefined
        }
        return ids.map(remapTestId)
      }
      const files = yield* toFileResults(results, remapTestIds)
      const testFiles = yield* toTestFiles(remapTestId)

      return {
        files,
        schemaVersion: '1.0',
        thresholds: input.options.thresholds,
        testFiles,
        projectRoot: input.basePath,
        config: input.options,
        framework: {
          ...STRYKER_FRAMEWORK,
          dependencies: yield* discoverDependencies(),
        },
      }
    })

  const MANIFEST_SPECIFIERS = [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-plugins',
    'vitest',
    'karma',
    'karma-chai',
    'karma-chrome-launcher',
    'karma-jasmine',
    'karma-mocha',
    'mocha',
    'jasmine',
    'jasmine-core',
    'jest',
    'react-scripts',
    'typescript',
    '@angular/cli',
    'webpack',
    'webpack-cli',
    'ts-jest',
  ] as const

  const ManifestSchema = S.Struct({ version: S.optional(S.String) })

  /**
   * One dependency's installed version, or nothing.
   *
   * The specifier is resolved against this module with `import.meta.resolve` — a standard ESM
   * builtin, so no `node:module` require is involved — and its manifest is read through the
   * platform FileSystem. Every failure is contained here and reported as `Option.none`,
   * because a framework the project does not install is the normal case, not an error.
   */
  const readManifestVersion = (
    fs: FileSystem.FileSystem,
    pathService: Path.Path,
    specifier: string,
  ): Effect.Effect<Option.Option<string>> =>
    Effect.gen(function*() {
      const resolved = yield* Effect.try(() => new URL(import.meta.resolve(`${specifier}/package.json`)))
      const manifestPath = yield* pathService.fromFileUrl(resolved)
      const text = yield* fs.readFileString(manifestPath)
      return Result.match(S.decodeUnknownResult(S.fromJsonString(ManifestSchema))(text), {
        onFailure: () => Option.none<string>(),
        onSuccess: (manifest) => Option.some(manifest.version ?? ''),
      })
    }).pipe(Effect.orElseSucceed(() => Option.none<string>()))

  const discoverDependencies = (): Effect.Effect<
    schema.Dependencies,
    never,
    FileSystem.FileSystem | Path.Path
  > =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      const pairs = yield* Effect.forEach(
        MANIFEST_SPECIFIERS,
        (specifier) =>
          Effect.map(readManifestVersion(fs, pathService, specifier), (version) => [specifier, version] as const),
        { concurrency: 'unbounded' },
      )
      const found: schema.Dependencies = {}
      for (const [specifier, version] of pairs) {
        if (Option.isSome(version)) {
          found[specifier] = version.value
        }
      }
      return found
    })

  const determineExitCode = (
    metrics: MutationTestMetricsResult,
  ): Effect.Effect<ExitClass | null> =>
    Effect.gen(function*() {
      const { mutationScore } = metrics.systemUnderTestMetrics.metrics
      const breaking = input.options.thresholds.break
      const formattedScore = mutationScore.toFixed(2)

      if (typeof breaking !== 'number') {
        yield* Effect.logDebug(
          "No breaking threshold configured. Won't fail the build no matter how low your mutation score is. Set `thresholds.break` to change this behavior.",
        )
        return null
      }

      const verdict = verdictExitClass(mutationScore, breaking)
      if (verdict === null) {
        yield* Effect.logInfo(
          `Final mutation score of ${formattedScore} is greater than or equal to break threshold ${String(breaking)}`,
        )
        return null
      }

      yield* Effect.logError(
        `Final mutation score ${formattedScore} under breaking threshold ${
          String(breaking)
        }, setting exit code to 1 (failure).`,
      )
      yield* Effect.logInfo(
        '(improve mutation score or set `thresholds.break = null` to prevent this error in the future)',
      )
      return verdict
    })
  const emitVerdict = (
    report: schema.MutationTestResult,
    pathService: Path.Path,
  ): Effect.Effect<void, never, RunEvents> =>
    Effect.gen(function*() {
      const envelope = buildVerdictEnvelope(
        report,
        input.resolvedMode.mode,
        input.resolvedMode.signal,
        input.runId,
        input.basePath,
        pathService,
      )
      const queue = yield* RunEvents
      yield* Queue.offer(
        queue,
        new VerdictReached({
          schemaVersion: envelope.schemaVersion,
          runId: envelope.runId,
          mode: envelope.mode,
          signal: envelope.signal,
          score: envelope.score,
        }),
      )
    })

  const reportAll: MutationReportingService['reportAll'] = (results) =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const report = yield* mutationTestReport(results)
      const metrics = calculateMutationTestMetrics(report)
      yield* input.reporter.onMutationTestReportReady(report, metrics)
      const verdict = yield* determineExitCode(metrics)
      yield* emitVerdict(report, pathService)
      if (input.options.incremental && verdict === null) {
        const fs = yield* FileSystem.FileSystem
        const dir = pathService.dirname(input.options.incrementalFile)
        yield* fs.makeDirectory(dir, { recursive: true })
        yield* fs.writeFileString(input.options.incrementalFile, JSON.stringify(report, null, 2))
      }
      return { results, verdict } satisfies RunOutcome
    })

  return {
    reportCheckFailure,
    reportMutantRunResult,
    reportAll,
  }
}

export const makeMutationReportingLayer = (input: MakeMutationReportingInput): Layer.Layer<MutationReporting> =>
  Layer.succeed(MutationReporting, makeMutationReportingService(input))
