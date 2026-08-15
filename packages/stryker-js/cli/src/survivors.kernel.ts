import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'

import { toRelativeNormalizedFileName } from '@systemfsoftware/stryker-js-mutation-run/mutants/incremental-differ'

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

/**
 * The remediation every rejection carries (R10): name the full run to do
 * first, never the survivors run itself.
 */
export const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'

/**
 * The survivors-run bookkeeping keys carried in the resolved options. They
 * are run mechanics, not configuration: a survivors run adds them, so without
 * stripping them the current run's hash would differ from the prior full
 * run's hash for the very same configuration. Their presence in a report's
 * embedded config is also the marker that the report was produced by a
 * survivors run (KTD7).
 */
export const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const

export interface SurvivorsHashInput {
  readonly resolvedOptions: Record<string, unknown>
  readonly frameworkVersion: string | undefined
  readonly sourceContentHashes: Readonly<Record<string, string>>
}

/**
 * The sha256-hex digest capability the admission hash needs. Supplied by the
 * caller so this kernel stays runtime-module-free; the shell wires
 * `createHash('sha256').update(content, 'utf-8').digest('hex')`.
 */
export type HashContent = (content: string) => string

/**
 * The relative-to-absolute path capability the mutant conversion needs.
 * Supplied by the caller so this kernel stays runtime-module-free; the shell
 * wires `path.resolve`.
 */
export type ResolveAbsolutePath = (file: string) => string

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The resolved options without the survivors-run bookkeeping keys, so both
 * sides of the admission hash describe the same configuration.
 */
export function stripSurvivorsKeys(config: unknown): Record<string, unknown> {
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
export function wasProducedBySurvivorsRun(priorReport: schema.MutationTestResult): boolean {
  const config = priorReport.config
  return isRecord(config) && 'survivorsPriorReport' in config
}

/**
 * The sha256 content hash both sides of the admission comparison use: the
 * current run's source files and the sources the prior report embeds. The
 * digest capability is supplied by the caller.
 */
export function sourceContentHash(content: string, hash: HashContent): string {
  return hash(content)
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
export function structuralHash(input: SurvivorsHashInput, hash: HashContent): string {
  return hash(serializeSurvivorsHashInput(input))
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
export function reportMutantToMutant(
  file: string,
  mutant: schema.MutantResult,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant {
  return {
    id: mutant.id,
    fileName: resolveAbsolutePath(file),
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
export function extractSurvivors(
  priorReport: schema.MutationTestResult,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant[] {
  const survivors: Mutant[] = []
  for (const [file, fileResult] of Object.entries(priorReport.files)) {
    for (const mutant of fileResult.mutants) {
      if (mutant.status === 'Survived') {
        survivors.push(reportMutantToMutant(file, mutant, resolveAbsolutePath))
      }
    }
  }
  return survivors
}

/**
 * The survivor spans as `file:startLine:startCol-endLine:endCol` mutate
 * ranges: the report's 1-based lines with the internal 0-based columns,
 * relative file names, deduplicated in first-seen order.
 */
export function survivorMutateSpans(survivors: readonly Mutant[]): string[] {
  const spans: string[] = []
  const seen = new Set<string>()
  for (const survivor of survivors) {
    const file = toRelativeNormalizedFileName(survivor.fileName)
    const { start, end } = survivor.location
    const span = `${file}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
    if (!seen.has(span)) {
      seen.add(span)
      spans.push(span)
    }
  }
  return spans
}

/**
 * The command of the admission workflow. It lives here rather than in the workflow
 * because every field is a kernel type or a capability the kernel already names, and the
 * workflow imports its kernel rather than the reverse.
 */
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
  /** The sha256 digest capability the admission hash needs. */
  readonly hashContent: HashContent
  /** The relative-to-absolute path capability the mutant conversion needs. */
  readonly resolveAbsolutePath: ResolveAbsolutePath
}

const NO_REPORT_DETAIL = 'No prior mutation report found — a --survivors run needs the report of a previous run.'
const SURVIVORS_RUN_SOURCE_DETAIL =
  'The prior mutation report was itself produced by a --survivors run, so it is not a valid input for another one.'
const MISMATCH_DETAIL =
  'The prior mutation report does not match the current run (resolved options, framework version, or source content differ).'

/** The per-file source hashes of the sources the prior report embeds. */
export function priorSourceHashes(
  priorReport: schema.MutationTestResult,
  hashContent: HashContent,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(priorReport.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, hashContent),
    ]),
  )
}

/**
 * Whether the admission hashes agree: the prior report's embedded resolved
 * options, framework version and source content against the current run's.
 */
export function hashesMatch(
  priorReport: schema.MutationTestResult,
  input: AdmitSurvivorsRunInput,
): boolean {
  const priorHash = structuralHash({
    resolvedOptions: stripSurvivorsKeys(priorReport.config),
    frameworkVersion: priorReport.framework?.version,
    sourceContentHashes: priorSourceHashes(priorReport, input.hashContent),
  }, input.hashContent)
  const currentHash = structuralHash({
    resolvedOptions: stripSurvivorsKeys(input.currentConfig),
    frameworkVersion: input.frameworkVersion,
    sourceContentHashes: input.sourceContentHashes,
  }, input.hashContent)
  return priorHash === currentHash
}

/**
 * The admission classification, over primitives and kernel types only.
 *
 * The three rejecting kinds already carry the reason and the composed remediation, so the
 * workflow assigns channels rather than re-deciding: one arm per kind, no guard chain. The
 * order is the order of consequence - a missing report cannot be inspected for provenance,
 * a survivors-sourced report is invalid whatever it contains, an empty survivor set is a
 * success rather than a mismatch, and only a non-empty set is worth hashing.
 */
export type AdmissionVerdict =
  | { readonly kind: 'reject'; readonly reason: 'no-report' | 'mismatch'; readonly remediation: string }
  | { readonly kind: 'no-survivors' }
  | { readonly kind: 'admit'; readonly survivors: readonly Mutant[] }

const rejection = (reason: 'no-report' | 'mismatch', detail: string): AdmissionVerdict => ({
  kind: 'reject',
  reason,
  remediation: `${detail} ${SURVIVORS_RUN_FIRST_REMEDIATION}`,
})

export function admissionVerdict(input: AdmitSurvivorsRunInput): AdmissionVerdict {
  const priorReport = input.priorReport
  if (priorReport === undefined) return rejection('no-report', NO_REPORT_DETAIL)
  if (wasProducedBySurvivorsRun(priorReport)) return rejection('mismatch', SURVIVORS_RUN_SOURCE_DETAIL)
  const survivors = extractSurvivors(priorReport, input.resolveAbsolutePath)
  if (survivors.length === 0) return { kind: 'no-survivors' }
  if (!hashesMatch(priorReport, input)) return rejection('mismatch', MISMATCH_DETAIL)
  return { kind: 'admit', survivors }
}
