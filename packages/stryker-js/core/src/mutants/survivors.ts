import path from 'path'

import { Mutant, schema } from '@stryker-mutator/api/core'
import { createHash } from 'node:crypto'

import { ExitClass } from '../utils/object-utils.js'

import { toRelativeNormalizedFileName } from './incremental-differ.js'

/**
 * U8 — survivor re-run admission (R10, R11, KTD6, KTD7).
 *
 * The `--survivors` run re-tests exactly the mutants that survived a previous
 * run. Its input is the previous run's mutation report, and the run is
 * admitted only when a single structural hash of the resolved options, the
 * recorded framework version, and the per-file source content all match the
 * current run (KTD6). Because thresholds live inside the resolved options, a
 * threshold-only change is caught for free. Every rejection exits 2 with a
 * remediation naming the full run to do first; zero survivors exits 0 with a
 * null score and writes no new report (AE3); and a report written by a
 * survivors run is never admitted as the input of another survivors run
 * (KTD7), so chaining two survivors runs fails loudly instead of re-testing a
 * shrunken or stale set.
 *
 * All functions here are pure over their inputs — no file I/O — so the
 * admission logic is fixture-testable in seconds.
 */

/** The path a `--survivors` run reads when no `survivorsPriorReport` is configured. */
export const DEFAULT_SURVIVORS_PRIOR_REPORT = 'reports/mutation-report.json'

/** The exit class a rejected survivors run exits with (R6: exit 2). */
export const SURVIVORS_REJECT_EXIT_CLASS: ExitClass = ExitClass.ConfigError

/** The exit code of a survivors run with zero survivors to re-test (R6: exit 0). */
export const SURVIVORS_EMPTY_EXIT_CODE = 0

/**
 * The remediation every rejection carries (R10): name the full run to do
 * first, never the survivors run itself.
 */
export const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'

export type SurvivorsRejectReason = 'no-report' | 'mismatch' | 'empty'

export type SurvivorsAdmission =
  | { readonly ok: true; readonly survivors: readonly Mutant[] }
  | {
    readonly ok: false
    readonly reason: SurvivorsRejectReason
    readonly remediation: string
  }

export interface AdmitSurvivorsRunInput {
  /**
   * The prior run's mutation report. `undefined` when no usable report
   * exists — the run cannot be admitted without one ('no-report').
   */
  readonly priorReport: schema.MutationTestResult | undefined
  /** The current run's resolved options (defaults + config file + CLI). */
  readonly currentConfig: Record<string, unknown>
  /** The current CLI/framework version (`strykerVersion`). */
  readonly frameworkVersion: string
  /**
   * Per-file content hashes of the current source, keyed by the prior
   * report's relative file keys. The prior side is hashed from the sources
   * the report embeds, so an editor save that shifts line ranges — which
   * would silently re-test a different mutant than the one that survived —
   * is caught here.
   */
  readonly sourceContentHashes: Readonly<Record<string, string>>
}

/** The structural identity a survivors run is admitted on (KTD6). */
export interface SurvivorsHashInput {
  readonly resolvedOptions: Record<string, unknown>
  readonly frameworkVersion: string | undefined
  readonly sourceContentHashes: Readonly<Record<string, string>>
}

/**
 * The survivors-run bookkeeping keys carried in the resolved options. They
 * are run mechanics, not configuration: a survivors run adds them, so without
 * stripping them the current run's hash would differ from the prior full
 * run's hash for the very same configuration. Their presence in a report's
 * embedded config is also the marker that the report was produced by a
 * survivors run (KTD7).
 */
const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The resolved options without the survivors-run bookkeeping keys, so both
 * sides of the admission hash describe the same configuration.
 */
function stripSurvivorsKeys(config: unknown): Record<string, unknown> {
  if (!isRecord(config)) {
    return {}
  }
  const rest: Record<string, unknown> = { ...config }
  for (const key of SURVIVORS_BOOKKEEPING_KEYS) {
    delete rest[key]
  }
  return rest
}

/**
 * A report written by a survivors run embeds the bookkeeping key in its
 * `config` (the report helper writes the resolved options). Such a report is
 * never a valid input for another survivors run (KTD7): without this check
 * the second run would either re-read a shrunken set or re-test a stale one.
 */
function wasProducedBySurvivorsRun(priorReport: schema.MutationTestResult): boolean {
  const config = priorReport.config
  return isRecord(config) && 'survivorsPriorReport' in config
}

/**
 * The sha256 content hash both sides of the admission comparison use: the
 * current run's source files and the sources the prior report embeds.
 */
export function sourceContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

/**
 * Serializes the hash input with keys sorted at every level, so the hash is a
 * pure function of the data and not of object key insertion order. The shape
 * is pinned by a golden snapshot test: a serialization change here fails
 * loudly instead of silently invalidating every prior report in the wild.
 */
export function serializeSurvivorsHashInput(input: SurvivorsHashInput): string {
  return JSON.stringify(sortKeys(input))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    )
  }
  return value
}

/** The single structural hash the admission compares (KTD6). */
export function structuralHash(input: SurvivorsHashInput): string {
  return createHash('sha256').update(serializeSurvivorsHashInput(input)).digest('hex')
}

/**
 * The survivor matching key (R10/R11): the same identifying key the
 * incremental differ uses — relative file name, location, mutator name and
 * replacement — so a per-mutant entry taken from the verdict envelope (U4),
 * which carries exactly these fields, is sufficient input to reconstruct a
 * survivor with no access to the report file.
 */
export function survivorIdentifyingKey(input: {
  readonly file: string
  readonly location: schema.Location
  readonly mutatorName: string
  readonly replacement: string | undefined
}): string {
  const {
    file,
    location: { start, end },
    mutatorName,
    replacement,
  } = input
  return `${
    toRelativeNormalizedFileName(file)
  }@${start.line}:${start.column}-${end.line}:${end.column}\n${mutatorName}: ${replacement}`
}

/**
 * Converts a report mutant (1-based schema location) into the internal mutant
 * shape a run consumes (0-based positions, absolute file name) — the exact
 * inverse of `objectUtils.toSchemaLocation` and the same shift the
 * incremental report reader applies (`project-reader.ts`). Mutants without a
 * replacement fall back to their mutator name, the same convention the
 * incremental differ uses.
 */
function reportMutantToMutant(file: string, mutant: schema.MutantResult): Mutant {
  return {
    id: mutant.id,
    fileName: path.resolve(file),
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacement ?? mutant.mutatorName,
    location: {
      start: {
        line: mutant.location.start.line - 1,
        column: mutant.location.start.column - 1,
      },
      end: {
        line: mutant.location.end.line - 1,
        column: mutant.location.end.column - 1,
      },
    },
  }
}

/**
 * The survivors of the prior report: exactly the mutants whose status is
 * `Survived`, converted to the internal mutant shape so a run can re-test
 * them.
 */
function extractSurvivors(priorReport: schema.MutationTestResult): Mutant[] {
  const survivors: Mutant[] = []
  for (const [file, fileResult] of Object.entries(priorReport.files)) {
    for (const mutant of fileResult.mutants) {
      if (mutant.status === 'Survived') {
        survivors.push(reportMutantToMutant(file, mutant))
      }
    }
  }
  return survivors
}

/** The per-file source hashes of the sources the prior report embeds. */
function priorSourceHashes(priorReport: schema.MutationTestResult): Record<string, string> {
  return Object.fromEntries(
    Object.entries(priorReport.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source),
    ]),
  )
}

function reject(
  reason: Exclude<SurvivorsRejectReason, 'empty'>,
  detail: string,
): SurvivorsAdmission {
  return {
    ok: false,
    reason,
    remediation: `${detail} ${SURVIVORS_RUN_FIRST_REMEDIATION}`,
  }
}

/**
 * Admits a survivors-only run against the prior mutation report. The prior
 * report must be a full run's report (KTD7), must describe the current run
 * (KTD6), and must actually contain survivors; anything else is a rejection
 * whose remediation names the full run to do first. On admission the run's
 * mutant set is exactly the prior report's survivor set.
 */
export function admitSurvivorsRun({
  priorReport,
  currentConfig,
  frameworkVersion,
  sourceContentHashes,
}: AdmitSurvivorsRunInput): SurvivorsAdmission {
  if (priorReport === undefined) {
    return reject(
      'no-report',
      'No prior mutation report found — a --survivors run needs the report of a previous run.',
    )
  }
  if (wasProducedBySurvivorsRun(priorReport)) {
    return reject(
      'mismatch',
      'The prior mutation report was itself produced by a --survivors run, so it is not a valid input for another one.',
    )
  }
  const survivors = extractSurvivors(priorReport)
  if (survivors.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      remediation: 'The prior report contains no survivors to re-test. Run a full `stryker run` to refresh it.',
    }
  }
  const priorHash = structuralHash({
    resolvedOptions: stripSurvivorsKeys(priorReport.config),
    frameworkVersion: priorReport.framework?.version,
    sourceContentHashes: priorSourceHashes(priorReport),
  })
  const currentHash = structuralHash({
    resolvedOptions: stripSurvivorsKeys(currentConfig),
    frameworkVersion,
    sourceContentHashes,
  })
  if (priorHash !== currentHash) {
    return reject(
      'mismatch',
      'The prior mutation report does not match the current run (resolved options, framework version, or source content differ).',
    )
  }
  return { ok: true, survivors }
}

/**
 * The typed failure a rejected survivors run fails with. The cli layer maps
 * it to exit 2 (`SURVIVORS_REJECT_EXIT_CLASS`) and surfaces `remediation` in
 * the error envelope (U6); the message carries the same text, so the
 * envelope names the full run to do first even where only the failure text
 * is shown.
 */
export class SurvivorsRejection extends Error {
  constructor(
    readonly reason: Exclude<SurvivorsRejectReason, 'empty'>,
    readonly remediation: string,
  ) {
    super(remediation)
    this.name = 'SurvivorsRejection'
  }
}
