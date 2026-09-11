import { randomBytes } from '@noble/hashes/utils'
import type { EvaluatorVerdict } from '@systemfsoftware/stryker-js/Evaluator'
import type { Location, MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Report'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'

import type { ModeSignal, OutputMode } from './output-mode.js'

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

export const VERDICT_ENVELOPE_SCHEMA_VERSION = '1.2'

export const ACTIONABLE_STATUSES = ['Survived', 'NoCoverage', 'Timeout', 'RuntimeError'] as const

export function isActionableStatus(status: MutantStatus): boolean {
  return ACTIONABLE_STATUSES.some((actionable) => actionable === status)
}

export interface VerdictMutant {
  readonly id: string
  readonly file: string
  readonly location: Location
  readonly mutator: string
  readonly replacement: string | null
  readonly status: MutantStatus
}

export interface EvaluatorRun {
  readonly name: string
  readonly verdict: EvaluatorVerdict
}

export type EvaluatorVerdictEntry = NonNullable<EvaluatorVerdict>

export type VerdictEvaluators = Readonly<Record<string, EvaluatorVerdictEntry>>

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
  readonly evaluators?: VerdictEvaluators
}

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

interface Base32Accumulator {
  readonly value: number
  readonly bits: number
  readonly chars: string
}

const emitQuint = (accumulator: Base32Accumulator): Base32Accumulator => {
  const bits = accumulator.bits - 5
  return {
    value: accumulator.value & ((1 << bits) - 1),
    bits,
    chars: accumulator.chars + CROCKFORD_BASE32[(accumulator.value >>> bits) & 0x1f],
  }
}

const drainQuints = (accumulator: Base32Accumulator): Base32Accumulator =>
  Match.value(accumulator.bits >= 5).pipe(
    Match.when(true, () => drainQuints(emitQuint(accumulator))),
    Match.when(false, () => accumulator),
    Match.exhaustive,
  )

const pushByte = (accumulator: Base32Accumulator, byte: number): Base32Accumulator =>
  drainQuints({ value: (accumulator.value << 8) | byte, bits: accumulator.bits + 8, chars: accumulator.chars })

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
  const drained = Array.from(bytes).reduce(pushByte, { value: 0, bits: 0, chars: '' })
  return Match.value(drained.bits > 0).pipe(
    Match.when(true, () => drained.chars + CROCKFORD_BASE32[(drained.value << (5 - drained.bits)) & 0x1f]),
    Match.when(false, () => drained.chars),
    Match.exhaustive,
  )
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
  const jsonReporter = Option.flatMap(decoded, (config) => Option.fromUndefinedOr(config.jsonReporter))
  return {
    jsonReporterFileName: Option.getOrUndefined(Option.map(jsonReporter, (reporter) => reporter.fileName)),
  }
}

function breakThreshold(thresholds: schema.Thresholds): number | null {
  const ThresholdsBreakSchema = S.StructWithRest(
    S.Struct({
      break: S.optional(S.Union([S.Number, S.Null])),
    }),
    [S.Record(S.String, S.Unknown)],
  )
  const decoded = S.decodeUnknownOption(ThresholdsBreakSchema)(thresholds)
  return Option.getOrNull(Option.flatMap(decoded, (value) => Option.fromNullishOr(value.break)))
}

const actionableMutants = (files: schema.MutationTestResult['files']): readonly VerdictMutant[] =>
  Object.entries(files).flatMap(([file, fileResult]) =>
    fileResult.mutants
      .filter((mutant) => isActionableStatus(mutant.status))
      .map((mutant): VerdictMutant => ({
        id: mutant.id,
        file,
        location: mutant.location,
        mutator: mutant.mutatorName,
        replacement: mutant.replacement ?? null,
        status: mutant.status,
      }))
  )

const evaluatorEntryOf = (run: EvaluatorRun): ReadonlyArray<readonly [string, EvaluatorVerdictEntry]> => {
  if (run.verdict === null) {
    return []
  }
  return [[run.name, run.verdict]]
}

const addingEvaluators = (
  envelope: Omit<VerdictEnvelope, 'evaluators'>,
  evaluators: VerdictEvaluators,
): VerdictEnvelope => {
  if (Object.keys(evaluators).length === 0) {
    return envelope
  }
  return { ...envelope, evaluators }
}

export function buildVerdictEnvelope(
  report: schema.MutationTestResult,
  mode: OutputMode,
  signal: ModeSignal,
  runId: string,
  basePath: string,
  pathService: Path.Path,
  evaluators: readonly EvaluatorRun[] = [],
): VerdictEnvelope {
  const metrics = calculateMetrics(report.files).metrics
  const { jsonReporterFileName } = embeddedConfig(report)
  const evaluatorVerdicts = Object.fromEntries(evaluators.flatMap(evaluatorEntryOf))
  const envelope: Omit<VerdictEnvelope, 'evaluators'> = {
    schemaVersion: VERDICT_ENVELOPE_SCHEMA_VERSION,
    runId,
    mode,
    signal,
    score: Option.getOrNull(
      Option.filter(Option.some(metrics.mutationScore), (score) => metrics.totalMutants > 0 && Number.isFinite(score)),
    ),
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
    reportFile: Option.getOrNull(
      Option.map(
        Option.filter(Option.fromUndefinedOr(jsonReporterFileName), () => metrics.totalMutants > 0),
        (fileName) => normalizeFileName(pathService.relative(basePath, fileName)),
      ),
    ),
    mutants: actionableMutants(report.files),
  }
  return addingEvaluators(envelope, evaluatorVerdicts)
}
