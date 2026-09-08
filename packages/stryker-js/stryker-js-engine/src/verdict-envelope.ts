import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import type * as schema from 'mutation-testing-report-schema/api'

import type { ModeSignal, OutputMode } from './output-mode.js'

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

/**
 * The statuses a `verdict.mutants` entry (and a `mutant` stream line, U7) is
 * recorded for (R20). `Killed`, `Ignored`, and `CompileError` are reported
 * as counts only: the full per-mutant record stays in the report file, and
 * enumerating killed mutants served no consumer while pushing the terminal
 * line past the 64 KB limit of `bufio.Scanner`-class readers. Measured:
 * `oxlint-plugins/effect-workflow` produced a 2164-entry, ~440 KB line with
 * zero actionable entries. This is the single definition of the R20 filter,
 * shared with the progress stream.
 */
export const ACTIONABLE_STATUSES = ['Survived', 'NoCoverage', 'Timeout', 'RuntimeError'] as const

/**
 * Whether `status` is actionable (R20) — one of `ACTIONABLE_STATUSES`.
 */
export function isActionableStatus(status: MutantStatus): boolean {
  return ACTIONABLE_STATUSES.some((actionable) => actionable === status)
}

/**
 * One mutant as the envelope reports it. `file` is the report's relative file
 * key; `location`/`mutator`/`replacement` are exactly the survivor re-run
 * matching key (R10/R11).
 */
export interface VerdictMutant {
  readonly id: string
  readonly file: string
  readonly location: schema.Location
  readonly mutator: string
  readonly replacement: string | null
  readonly status: MutantStatus
}

/**
 * The configured thresholds. `break` rides along even though the report
 * schema does not declare it — it is the threshold the exit code depends on.
 */
export interface VerdictThresholds {
  readonly high: number
  readonly low: number
  readonly break: number | null
}

export interface VerdictCounts {
  readonly killed: number
  readonly timeout: number
  readonly survived: number
  readonly noCoverage: number
  readonly runtimeErrors: number
  readonly compileErrors: number
  readonly ignored: number
  readonly pending: number
}

/**
 * The full verdict document. `score` and `reportFile` are `null` for a run
 * with zero mutants (AE3): there is no score to report and no report file was
 * written. `mutants` is bounded to `ACTIONABLE_STATUSES` (R20) — see that
 * definition for why the remaining statuses are counts only.
 */
export interface VerdictEnvelope {
  readonly schemaVersion: string
  readonly runId: string
  readonly mode: OutputMode
  readonly signal: ModeSignal
  readonly score: number | null
  readonly thresholds: VerdictThresholds
  readonly counts: VerdictCounts
  readonly reportFile: string | null
  readonly mutants: readonly VerdictMutant[]
}

/**
 * The resolved options the report helper embeds as `report.config` (it writes
 * `config: this.options`). Decoded through a schema so the schema is the
 * single source of the shape — the prior `in`-narrowing chain is deleted.
 * The report schema types `config` as `{}`, while the runtime value is the full
 * resolved `StrykerOptions` with its index signature; `StructWithRest` allows
 * the extra keys.
 */
function embeddedConfig(
  report: schema.MutationTestResult,
): {
  readonly jsonReporterFileName: string | undefined
} {
  const JsonReporterSchema = S.Struct({
    fileName: S.String,
  })
  const EmbeddedConfigSchema = S.StructWithRest(
    S.Struct({
      jsonReporter: S.optional(JsonReporterSchema),
    }),
    [S.Record(S.String, S.Unknown)],
  )
  const decoded = S.decodeUnknownOption(EmbeddedConfigSchema)(report.config)
  if (Option.isNone(decoded)) {
    return { jsonReporterFileName: undefined }
  }
  return { jsonReporterFileName: decoded.value.jsonReporter?.fileName }
}

function breakThreshold(thresholds: schema.Thresholds): number | null {
  const ThresholdsBreakSchema = S.StructWithRest(
    S.Struct({
      break: S.optional(S.Union([S.Number, S.Null])),
    }),
    [S.Record(S.String, S.Unknown)],
  )
  const decoded = S.decodeUnknownOption(ThresholdsBreakSchema)(thresholds)
  if (Option.isNone(decoded)) {
    return null
  }
  return decoded.value.break ?? null
}

export namespace VerdictEnvelope {
  export const SCHEMA_VERSION = '1.1'

  export interface FromReportOptions {
    readonly report: schema.MutationTestResult
    readonly mode: OutputMode
    readonly signal: ModeSignal
    readonly runId: string
    readonly basePath: string
    readonly pathService: Path.Path
  }

  export const fromReport = (options: FromReportOptions): VerdictEnvelope => {
    const { report, mode, signal, runId, basePath, pathService } = options
    const { jsonReporterFileName } = embeddedConfig(report)
    const metrics = calculateMutationTestMetrics(report)
      .systemUnderTestMetrics.metrics
    const hasMutants = metrics.totalMutants > 0
    let score: number | null = null
    if (hasMutants && Number.isFinite(metrics.mutationScore)) {
      score = metrics.mutationScore
    }
    let reportFile: string | null = null
    if (hasMutants && jsonReporterFileName !== undefined) {
      reportFile = normalizeFileName(pathService.relative(basePath, jsonReporterFileName))
    }
    const mutants: VerdictMutant[] = []
    for (const [file, fileResult] of Object.entries(report.files)) {
      for (const mutant of fileResult.mutants) {
        if (!isActionableStatus(mutant.status)) {
          continue
        }
        mutants.push({
          id: mutant.id,
          file,
          location: mutant.location,
          mutator: mutant.mutatorName,
          replacement: mutant.replacement ?? null,
          status: mutant.status,
        })
      }
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      runId,
      mode,
      signal,
      score,
      thresholds: {
        high: report.thresholds.high,
        low: report.thresholds.low,
        break: breakThreshold(report.thresholds),
      },
      counts: {
        killed: metrics.killed,
        timeout: metrics.timeout,
        survived: metrics.survived,
        noCoverage: metrics.noCoverage,
        runtimeErrors: metrics.runtimeErrors,
        compileErrors: metrics.compileErrors,
        ignored: metrics.ignored,
        pending: metrics.pending,
      },
      reportFile,
      mutants,
    }
  }
}
