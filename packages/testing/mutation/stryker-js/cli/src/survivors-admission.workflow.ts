import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'

import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { MutantShape } from './survivors-report.schema.js'

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
 * covering them are in this file's in-source block rather than in a kernel -
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
export function hashesMatch(
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

export function admissionVerdict(input: AdmitSurvivorsRunCommand): AdmissionVerdict {
  const priorReport = input.priorReport
  if (priorReport === undefined) return rejection('no-report', NO_REPORT_DETAIL)
  if (wasProducedBySurvivorsRun(priorReport)) return rejection('mismatch', SURVIVORS_RUN_SOURCE_DETAIL)
  if (input.priorSurvivors.length === 0) return { kind: 'no-survivors' }
  if (!hashesMatch(priorReport, input)) return rejection('mismatch', MISMATCH_DETAIL)
  return { kind: 'admit', survivors: input.priorSurvivors }
}

export type SurvivorsRejectReason = 'no-report' | 'mismatch'

export const SurvivorsAdmissionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/SurvivorsAdmission')
export type SurvivorsAdmissionTypeId = typeof SurvivorsAdmissionTypeId

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

/**
 * The survivors admission decision: the classification `admissionVerdict`
 * produces, assigned to the workflow channels — one arm per kind, no guard
 * chain. A missing report, a survivors-sourced report and a hash mismatch are
 * the same reject outcome with different reasons; only the rejection's
 * remediation names the full run to do first (R10).
 */
export const admitSurvivorsRun = Workflow.make(
  AdmitSurvivorsRunCommand,
  (command): Result.Result<SurvivorsAdmission, SurvivorsRejection> =>
    Match.value(admissionVerdict(command)).pipe(
      Match.discriminator('kind')(
        'reject',
        (verdict) => Result.fail(SurvivorsRejection.make({ reason: verdict.reason, remediation: verdict.remediation })),
      ),
      Match.discriminator('kind')('no-survivors', () => Result.succeed(NoSurvivors.make())),
      Match.discriminator('kind')(
        'admit',
        (verdict) => Result.succeed(Admitted.make({ survivors: verdict.survivors })),
      ),
      Match.exhaustive,
    ),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { refutes } = await import('@systemfsoftware/effect-schema-law/refutation')
  const { FastCheck: fc } = await import('effect/testing')

  const survivorWith = (
    start: { line: number | null; column: number | null },
    end: { line: number | null; column: number | null },
  ): unknown => ({
    _tag: 'Admitted',
    survivors: [
      {
        id: 'A',
        fileName: 'file.ts',
        mutatorName: 'mutator',
        replacement: 'replacement',
        location: { start, end },
      },
    ],
  })

  /**
   * `S.Finite` is one shared v4 node, so every location point weakens together
   * and the harness keeps a single obligation. Measured 2026-08-17: the stored
   * weakened arm accepts a non-finite number at `start.column` (the first
   * reaching path) but not at `start.line` — so the witness sits there. One
   * generator per schema discharges the shared obligation.
   */
  refutes(Admitted, {
    AdmittedLocationNonFinite: fc.constant(
      survivorWith({ line: 1, column: Number.POSITIVE_INFINITY }, { line: 1, column: 0 }),
    ),
  })

  refutes(SurvivorsAdmission, {
    SurvivorsAdmissionLocationNonFinite: fc.constant(
      survivorWith({ line: 1, column: Number.POSITIVE_INFINITY }, { line: 1, column: 0 }),
    ),
  })

  // These cover the helpers THIS file declares, which are the ones
  // `admissionVerdict` runs. `make-body-purity` follows the decision's
  // reachable set, so the helpers cannot be imported from a kernel; the
  // properties therefore have to live beside them. A copy of these functions
  // tested somewhere else would leave the suite green whichever copy drifted.
  const { describe, it: gherkinIt } = await import('@systemfsoftware/effect-gherkin-spec')
  const { isDeepStrictEqual } = await import('node:util')

  const configValueArb = fc.oneof(
    fc.string({ maxLength: 8 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  )

  const configArb = fc
    .dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 3 })
    .chain((random) =>
      fc.option(fc.string({ maxLength: 12 }), { nil: undefined }).map((prior) =>
        prior === undefined ? random : { ...random, survivorsPriorReport: prior }
      )
    )

  const hashInputArb = fc.record({
    resolvedOptions: fc.dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 4 }),
    frameworkVersion: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    sourceContentHashes: fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 16 }), { maxKeys: 4 }),
  })

  const reversed = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).reverse())

  describe('stripSurvivorsKeys', () => {
    gherkinIt.prop(
      '∀c_StripTwice_≡StripOnce',
      [configArb],
      ([config]) => isDeepStrictEqual(stripSurvivorsKeys(stripSurvivorsKeys(config)), stripSurvivorsKeys(config)),
    )

    gherkinIt.prop(
      '∀c_Strip_≡RemovesBookkeepingKeys',
      [configArb],
      ([config]) => SURVIVORS_BOOKKEEPING_KEYS.every((key) => !(key in stripSurvivorsKeys(config))),
    )

    gherkinIt.prop('∀c_Strip_≡LeavesInputUntouched', [configArb], ([config]) => {
      const before = Object.keys(config)
      const values = before.map((key) => config[key])
      stripSurvivorsKeys(config)
      return isDeepStrictEqual(before, Object.keys(config)) &&
        before.every((key, index) => Object.is(config[key], values[index]))
    })
  })

  describe('wasProducedBySurvivorsRun', () => {
    // The provenance marker is exactly what `stripSurvivorsKeys` removes, so a
    // stripped config can never look like a survivors-run product. If these two
    // ever disagree about the key, a survivors run silently accepts its own
    // output as input.
    gherkinIt.prop(
      '∀c_StrippedConfig_≡NeverSurvivorsProduced',
      [configArb],
      ([config]) => !wasProducedBySurvivorsRun({ config: stripSurvivorsKeys(config) }),
    )

    gherkinIt.prop(
      '∀c_CarryingTheMarker_≡SurvivorsProduced',
      [configArb],
      ([config]) => wasProducedBySurvivorsRun({ config: { ...config, survivorsPriorReport: 'r' } }),
    )
  })

  describe('serializeSurvivorsHashInput', () => {
    // Key insertion order must not change the text, or two identical runs
    // disagree and every prior report in the wild stops matching.
    gherkinIt.prop(
      '∀i_KeyOrder_≡SameText',
      [hashInputArb],
      ([input]) =>
        serializeSurvivorsHashInput(input) === serializeSurvivorsHashInput({
          resolvedOptions: reversed(input.resolvedOptions),
          frameworkVersion: input.frameworkVersion,
          sourceContentHashes: reversed(input.sourceContentHashes),
        }),
    )

    gherkinIt.prop('∀i_Serialization_≡LosslessRoundTrip', [hashInputArb], ([input]) =>
      isDeepStrictEqual(
        JSON.parse(serializeSurvivorsHashInput(input)),
        JSON.parse(JSON.stringify(input)),
      ))
  })
}
