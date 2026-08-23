import path from 'path'

import { type MutantStatus, schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { normalizeFileName } from '@systemfsoftware/stryker-js-util'
import { calculateMutationTestMetrics } from 'mutation-testing-metrics'
import { randomFillSync } from 'node:crypto'

import type { ModeSignal, OutputMode } from './output-mode.js'

/**
 * U4 — the verdict envelope (R5, R11, R20): the single JSON document machine
 * mode prints to stdout at the end of a run. Everything an agent needs to
 * act without opening the report file, including the survivor re-run
 * matching key per actionable mutant (R20 bounds the list). All functions
 * here are pure over the report — no I/O side effects, no randomness except
 * inside `generateRunId`.
 */
export const VERDICT_ENVELOPE_SCHEMA_VERSION = '1.0'

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

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A ULID-shaped run identifier: 48 bits of millisecond time followed by 80
 * random bits, Crockford base32-encoded into exactly 26 characters. The time
 * prefix keeps ids roughly sortable; the randomness makes collisions
 * negligible.
 */
export function generateRunId(): string {
  const bytes = new Uint8Array(16)
  const now = Date.now()
  bytes[0] = (now / 0x10000000000) % 0x100
  bytes[1] = (now / 0x100000000) % 0x100
  bytes[2] = (now / 0x1000000) % 0x100
  bytes[3] = (now / 0x10000) % 0x100
  bytes[4] = (now / 0x100) % 0x100
  bytes[5] = now % 0x100
  randomFillSync(bytes.subarray(6))
  let chars = ''
  let value = 0
  let bits = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      chars += CROCKFORD_BASE32[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
      value &= (1 << bits) - 1
    }
  }
  if (bits > 0) {
    chars += CROCKFORD_BASE32[(value << (5 - bits)) & 0x1f]
  }
  return chars
}

/**
 * The resolved options the report helper embeds as `report.config` (it writes
 * `config: this.options`). Read through `in`-narrowing because the report
 * schema types `config` as `{}`, while the embedded value is our own resolved
 * options with their index signature.
 */
function embeddedConfig(
  report: schema.MutationTestResult,
): {
  readonly jsonReporterFileName: string | undefined
} {
  const config = report.config
  let jsonReporterFileName: string | undefined
  if (typeof config === 'object' && config !== null) {
    if (
      'jsonReporter' in config &&
      typeof config.jsonReporter === 'object' &&
      config.jsonReporter !== null &&
      'fileName' in config.jsonReporter &&
      typeof config.jsonReporter.fileName === 'string'
    ) {
      jsonReporterFileName = config.jsonReporter.fileName
    }
  }
  return { jsonReporterFileName }
}

function breakThreshold(thresholds: schema.Thresholds): number | null {
  if ('break' in thresholds) {
    const breakValue = thresholds.break
    if (typeof breakValue === 'number') {
      return breakValue
    }
    if (breakValue === null) {
      return null
    }
  }
  return null
}

export function buildVerdictEnvelope(
  report: schema.MutationTestResult,
  mode: OutputMode,
  signal: ModeSignal,
  runId: string,
): VerdictEnvelope {
  const { jsonReporterFileName } = embeddedConfig(report)
  const metrics = calculateMutationTestMetrics(report)
    .systemUnderTestMetrics.metrics
  const hasMutants = metrics.totalMutants > 0
  const score = hasMutants && Number.isFinite(metrics.mutationScore)
    ? metrics.mutationScore
    : null
  const reportFile = hasMutants && jsonReporterFileName !== undefined
    ? normalizeFileName(path.relative(process.cwd(), jsonReporterFileName))
    : null
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
    schemaVersion: VERDICT_ENVELOPE_SCHEMA_VERSION,
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
