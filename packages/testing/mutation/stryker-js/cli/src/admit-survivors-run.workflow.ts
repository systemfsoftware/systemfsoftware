import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

/**
 * The mutant shape the admission carries, named once because both the decision's
 * `Admitted` payload and the command's precomputed survivor list are the same shape.
 */
const MutantShape = S.Struct({
  id: S.String,
  fileName: S.String,
  mutatorName: S.String,
  replacement: S.String,
  location: S.Struct({
    start: S.Struct({ line: S.Finite, column: S.Finite }),
    end: S.Struct({ line: S.Finite, column: S.Finite }),
  }),
})

export const PriorReportDocument = S.Struct({
  config: S.optional(S.Record(S.String, S.Unknown)),
  framework: S.optional(S.Struct({ version: S.optional(S.String) })),
  files: S.Record(
    S.String,
    S.Struct({
      source: S.String,
      mutants: S.Array(S.Struct({
        id: S.String,
        mutatorName: S.String,
        replacement: S.optional(S.String),
        status: S.String,
        location: S.Struct({
          start: S.Struct({ line: S.Finite, column: S.Finite }),
          end: S.Struct({ line: S.Finite, column: S.Finite }),
        }),
      })),
    }),
  ),
})

/**
 * U8 — survivor re-run admission (R10, R11, KTD6, KTD7).
 *
 * The `--survivors` run re-tests exactly the mutants that survived a previous
 * run. Its input is the previous run's mutation report, and the run is
 * admitted only when a single structural hash of the resolved options, the
 * recorded framework version, and the per-file source content all match the
 * current run (KTD6).
 */

/**
 * The decision's helpers reach three language built-ins the purity gate cannot
 * resolve as globals, so each is bound at module scope.
 *
 * These live here, beside the decision, because `make-body-purity` follows the
 * decision's reachable set: a helper `admissionVerdict` calls is checked as part
 * of the body even though it is declared outside it. That is why the properties
 * covering them are in this file's in-source block rather than beside a pure helper -
 * testing a copy the decision does not run is worse than not testing it, because
 * the suite goes green either way.
 */
const isArray: (value: unknown) => value is unknown[] = Array.isArray
const { fromEntries: objectFromEntries, keys: objectKeys } = Object
const stringify = JSON.stringify

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !isArray(value)
}

const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'
const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const

/**
 * The resolved options without the survivors-run bookkeeping keys, so both
 * sides of the admission comparison describe the same configuration.
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
 * `config`. Such a report is never a valid input for another survivors run
 * (KTD7): without this check the second run would either re-read a shrunken set
 * or re-test a stale one.
 */
function wasProducedBySurvivorsRun(priorReport: { readonly config: unknown }): boolean {
  const config = priorReport.config
  return isRecord(config) && 'survivorsPriorReport' in config
}

/**
 * Serializes the comparison input with keys sorted at every level, so the result
 * is a function of the data and not of key insertion order.
 */
function serializeSurvivorsHashInput(input: {
  readonly resolvedOptions: Record<string, unknown>
  readonly frameworkVersion: string | undefined
  readonly sourceContentHashes: Readonly<Record<string, string>>
}): string {
  return stringify(sortKeys(input))
}

function sortKeys(value: unknown): unknown {
  if (isArray(value)) {
    return value.map(sortKeys)
  }
  if (isRecord(value)) {
    return objectFromEntries(
      objectKeys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    )
  }
  return value
}
/**
 * The prior report's facts the decision reads: its embedded configuration, which carries
 * both the compared options and the survivors-run provenance marker, and the engine
 * version it recorded. The report's files are not here — the survivors and the per-file
 * source hashes derived from them need capabilities the command cannot hold, so they
 * arrive already computed.
 */
export class PriorReportFacts extends S.Class<PriorReportFacts>('PriorReportFacts')({
  config: S.Record(S.String, S.Unknown),
  frameworkVersion: S.UndefinedOr(S.String),
}) {}

/**
 * The command of the admission workflow: a schema class, because `Workflow.make`
 * constrains its first argument on the class value and a declared interface produces no
 * value to pass. Every field is pure data — the two capabilities the previous shape
 * carried, a digest function and a path resolver, can never be schema fields, so their
 * results arrive precomputed from the decode phase instead.
 */
export class AdmitSurvivorsRunCommand extends S.Class<AdmitSurvivorsRunCommand>('AdmitSurvivorsRunCommand')({
  /**
   * The prior run's report facts, `undefined` when no report exists — the run cannot be
   * admitted without one ('no-report'). Explicitly nullable rather than key-optional: a
   * missing report is a state the edge determined and states, not a key it forgot.
   */
  priorReport: S.UndefinedOr(PriorReportFacts),
  /** The current run's resolved options (defaults + config file + CLI). */
  currentConfig: S.Record(S.String, S.Unknown),
  /** The current CLI/framework version (`strykerVersion`). */
  frameworkVersion: S.String,
  /**
   * Per-file content hashes of the current source, keyed by the prior report's relative
   * file keys. The prior side is hashed from the sources the report embeds, so an editor
   * save that shifts line ranges — which would silently re-test a different mutant than
   * the one that survived — is caught here.
   */
  sourceContentHashes: S.Record(S.String, S.String),
  /** The same hashes for the sources the prior report embeds, computed at the edge. */
  priorSourceHashes: S.Record(S.String, S.String),
  /** The prior report's survivors, already converted to the internal mutant shape. */
  priorSurvivors: S.Array(MutantShape),
}) {}

const NO_REPORT_DETAIL = 'No prior mutation report found — a --survivors run needs the report of a previous run.'
const SURVIVORS_RUN_SOURCE_DETAIL =
  'The prior mutation report was itself produced by a --survivors run, so it is not a valid input for another one.'
const MISMATCH_DETAIL =
  'The prior mutation report does not match the current run (resolved options, framework version, or source content differ).'

/**
 * Whether the admission inputs agree: the prior report's embedded resolved options,
 * framework version and source content against the current run's.
 *
 * The comparison is on the canonical serializations rather than digests of them. Equal
 * serializations are equal runs, so the digest was a lossy restatement of the check that
 * also demanded a capability no command can carry.
 */
function hashesMatch(
  priorReport: PriorReportFacts,
  input: AdmitSurvivorsRunCommand,
): boolean {
  return serializeSurvivorsHashInput({
    resolvedOptions: stripSurvivorsKeys(priorReport.config),
    frameworkVersion: priorReport.frameworkVersion,
    sourceContentHashes: input.priorSourceHashes,
  }) === serializeSurvivorsHashInput({
    resolvedOptions: stripSurvivorsKeys(input.currentConfig),
    frameworkVersion: input.frameworkVersion,
    sourceContentHashes: input.sourceContentHashes,
  })
}

const SurvivorsAdmissionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/SurvivorsAdmission')
type SurvivorsAdmissionTypeId = typeof SurvivorsAdmissionTypeId

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {
  survivors: S.Array(MutantShape),
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}
export class NoSurvivors extends S.TaggedClass<NoSurvivors>()('NoSurvivors', {}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

export const SurvivorsAdmission = S.Union([Admitted, NoSurvivors])
export type SurvivorsAdmission = S.Schema.Type<typeof SurvivorsAdmission>
export class SurvivorsRejection extends S.TaggedError<SurvivorsRejection>()('SurvivorsRejection', {
  reason: S.Literals(['no-report', 'mismatch']),
  remediation: S.String,
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

function reject(
  reason: 'no-report' | 'mismatch',
  detail: string,
): Result.Result<SurvivorsAdmission, SurvivorsRejection> {
  return Result.fail(
    SurvivorsRejection.make({
      reason,
      remediation: `${detail} ${SURVIVORS_RUN_FIRST_REMEDIATION}`,
    }),
  )
}

function decideAdmission(
  input: AdmitSurvivorsRunCommand,
): Result.Result<SurvivorsAdmission, SurvivorsRejection> {
  const priorReport = input.priorReport
  if (priorReport === undefined) {
    return reject('no-report', NO_REPORT_DETAIL)
  }
  if (wasProducedBySurvivorsRun(priorReport)) {
    return reject('mismatch', SURVIVORS_RUN_SOURCE_DETAIL)
  }
  if (input.priorSurvivors.length === 0) {
    return Result.succeed(NoSurvivors.make())
  }
  if (!hashesMatch(priorReport, input)) {
    return reject('mismatch', MISMATCH_DETAIL)
  }
  return Result.succeed(Admitted.make({ survivors: input.priorSurvivors }))
}

function admissionDecision(
  command: AdmitSurvivorsRunCommand,
): Result.Result<SurvivorsAdmission, SurvivorsRejection> {
  return decideAdmission(command)
}

export const admitSurvivorsRun = Workflow.make(AdmitSurvivorsRunCommand, admissionDecision)
