import { randomBytes } from '@noble/hashes/utils'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Metrics'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'

import type { ModeSignal, OutputMode } from './output-mode.js'

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

export const VERDICT_ENVELOPE_SCHEMA_VERSION = '1.1'

export const ACTIONABLE_STATUSES = ['Survived', 'NoCoverage', 'Timeout', 'RuntimeError'] as const

export function isActionableStatus(status: MutantStatus): boolean {
  return ACTIONABLE_STATUSES.some((actionable) => actionable === status)
}

export interface VerdictMutant {
  readonly id: string
  readonly file: string
  readonly location: schema.Location
  readonly mutator: string
  readonly replacement: string | null
  readonly status: MutantStatus
}

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

export function generateRunId(): string {
  const bytes = new Uint8Array(16)
  const now = new Date().getTime()
  bytes[0] = (now / 0x10000000000) % 0x100
  bytes[1] = (now / 0x100000000) % 0x100
  bytes[2] = (now / 0x1000000) % 0x100
  bytes[3] = (now / 0x10000) % 0x100
  bytes[4] = (now / 0x100) % 0x100
  bytes[5] = now % 0x100
  bytes.set(randomBytes(10), 6)
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

export function buildVerdictEnvelope(
  report: schema.MutationTestResult,
  mode: OutputMode,
  signal: ModeSignal,
  runId: string,
  basePath: string,
  pathService: Path.Path,
): VerdictEnvelope {
  const { jsonReporterFileName } = embeddedConfig(report)
  const metrics = calculateMetrics(report.files).metrics
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
