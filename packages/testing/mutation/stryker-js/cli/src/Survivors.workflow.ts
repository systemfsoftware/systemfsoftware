import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'

import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { toRelativeNormalizedFileName } from '@systemfsoftware/stryker-js-mutation-run/mutants/incremental-differ'

/**
 * The decision's helper closure reaches three language built-ins the purity
 * gate cannot resolve as globals, so each is bound at module scope and the
 * helpers reference the bindings: `isArray` keeps `Array.isArray`'s narrow,
 * `objectEntries`/`objectFromEntries`/`objectKeys` keep `Object`'s trio, and
 * `stringify` keeps `JSON.stringify`'s exact text.
 */
const isArray: (value: unknown) => value is unknown[] = Array.isArray
const { entries: objectEntries, fromEntries: objectFromEntries, keys: objectKeys } = Object
const stringify = JSON.stringify

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
  return typeof value === 'object' && value !== null && !isArray(value)
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
export function wasProducedBySurvivorsRun(priorReport: { readonly config: unknown }): boolean {
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
  mutant: PriorReportMutant,
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
  priorReport: PriorReportDocument,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant[] {
  const survivors: Mutant[] = []
  for (const [file, fileResult] of objectEntries(priorReport.files)) {
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

/**
 * The prior report as a document, decoded at the boundary. Module-internal: consumers
 * get {@link decodePriorReport}, not the schema, so the report's wire shape is not a
 * surface commitment and the codec has exactly one caller.
 *
 * `status` is a bare string rather than the closed status set on purpose: the decide only
 * compares it to `'Survived'`, so a report written by a newer engine that added a status
 * must not be refused for carrying one.
 */
const PriorReportDocument = S.Struct({
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

/** The decoded prior report the edge precomputes from. */
export type PriorReportDocument = S.Schema.Type<typeof PriorReportDocument>

/** One mutant of a decoded prior report, before the 1-based to 0-based shift. */
export type PriorReportMutant = PriorReportDocument['files'][string]['mutants'][number]

/**
 * Decodes a prior report read from disk. Pure, so it runs in the decode phase, whose
 * `Left` is fatal by construction — it reaches the derived error channel and no write
 * runs. A malformed report therefore never reaches the decider, and nothing here casts
 * a third-party report type.
 */
export const decodePriorReport: (raw: unknown) => Result.Result<PriorReportDocument, S.SchemaError> = S
  .decodeUnknownResult(PriorReportDocument)

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

/** The per-file source hashes of the sources the prior report embeds. */
export function priorSourceHashes(
  priorReport: PriorReportDocument,
  hashContent: HashContent,
): Record<string, string> {
  return objectFromEntries(
    objectEntries(priorReport.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, hashContent),
    ]),
  )
}

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
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
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
}

/** The root the survivors laws mount fixture files under. */
const ABS_WORK_ROOT = '/work'

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { FastCheck: fc } = await import('effect/testing')
  const { isDeepStrictEqual } = await import('node:util')

  /** The arbitrary alias — `fc` is a block-local value here, so its type section is read through the module. */
  type Arbitrary<A> = import('effect/testing').FastCheck.Arbitrary<A>

  const configValueArb = fc.oneof(
    fc.string({ maxLength: 8 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  )

  const configArb: Arbitrary<Record<string, unknown>> = fc
    .dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 3 })
    .chain((random) =>
      fc.option(fc.string({ maxLength: 12 }), { nil: undefined }).map((prior) =>
        prior === undefined ? random : { ...random, survivorsPriorReport: prior }
      )
    )

  const reportPositionArb = fc.record({
    line: fc.integer({ min: 1, max: 200 }),
    column: fc.integer({ min: 1, max: 200 }),
  })

  const reportLocationArb = fc.record({ start: reportPositionArb, end: reportPositionArb })

  const mutantResultArb = fc.record(
    {
      id: fc.string({ minLength: 1, maxLength: 8 }),
      mutatorName: fc.string({ minLength: 1, maxLength: 8 }),
      location: reportLocationArb,
      status: fc.constantFrom<schema.MutantStatus>(
        'Killed',
        'Survived',
        'NoCoverage',
        'Timeout',
        'RuntimeError',
        'CompileError',
        'Ignored',
        'Pending',
      ),
      replacement: fc.string({ maxLength: 8 }),
    },
    { requiredKeys: ['id', 'mutatorName', 'location', 'status'] },
  )

  const fileResultArb = fc.record({
    language: fc.string({ maxLength: 8 }),
    source: fc.string({ maxLength: 16 }),
    mutants: fc.array(mutantResultArb, { maxLength: 5 }),
  })

  const reportArb: Arbitrary<schema.MutationTestResult> = fc.record({
    config: configArb,
    schemaVersion: fc.string({ maxLength: 8 }),
    thresholds: fc.record({ high: fc.integer(), low: fc.integer() }),
    files: fc.dictionary(fc.string({ maxLength: 8 }), fileResultArb, { maxKeys: 3 }),
  })

  const hashInputArb: Arbitrary<SurvivorsHashInput> = fc.record({
    resolvedOptions: fc.dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 4 }),
    frameworkVersion: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    sourceContentHashes: fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 16 }), { maxKeys: 4 }),
  })

  const cleanStringArb = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/)

  const keyFileArb = fc.constantFrom('src/a.js', 'src/b.js', 'src/c.js')

  const keyInputArb = fc.record({
    file: keyFileArb,
    location: reportLocationArb,
    mutatorName: cleanStringArb,
    replacement: fc.option(cleanStringArb, { nil: undefined }),
  })

  const internalPositionArb = fc.record({
    line: fc.integer({ min: 0, max: 100 }),
    column: fc.integer({ min: 0, max: 100 }),
  })

  const internalLocationArb = fc.record({ start: internalPositionArb, end: internalPositionArb })

  const mutantArb: Arbitrary<Mutant> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    fileName: fc.stringMatching(/^[a-z0-9]+(?:\/[a-z0-9]+)*$/),
    mutatorName: cleanStringArb,
    replacement: cleanStringArb,
    location: internalLocationArb,
  })

  const survivorListArb = fc.array(mutantArb, { maxLength: 8 })

  const absPath = (file: string): string => `${ABS_WORK_ROOT}/${file}`

  const permuteRecord = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).reverse())

  const permuteHashInput = (input: SurvivorsHashInput): SurvivorsHashInput => ({
    resolvedOptions: permuteRecord(input.resolvedOptions),
    frameworkVersion: input.frameworkVersion,
    sourceContentHashes: permuteRecord(input.sourceContentHashes),
  })

  const nextKeyFile = (file: string): string => file === 'src/a.js' ? 'src/b.js' : 'src/a.js'

  const shiftedLocation = (location: schema.Location): schema.Location => ({
    start: { ...location.start, line: location.start.line + 1 },
    end: location.end,
  })

  describe('stripSurvivorsKeys', () => {
    it.prop(
      '∀c_StripTwice_≡StripOnce',
      [configArb],
      ([config]) => isDeepStrictEqual(stripSurvivorsKeys(stripSurvivorsKeys(config)), stripSurvivorsKeys(config)),
    )

    it.prop('∀c_Strip_≡RemovesBookkeepingKeys', [configArb], ([config]) => {
      const stripped = stripSurvivorsKeys(config)
      return SURVIVORS_BOOKKEEPING_KEYS.every((key) => !(key in stripped))
    })

    it.prop('∀c_Strip_≡PreservesOthersAndInput', [configArb], ([config]) => {
      const inputKeys = Object.keys(config)
      const inputValues = inputKeys.map((key) => config[key])
      const stripped = stripSurvivorsKeys(config)
      const expectedKeys = inputKeys
        .filter((key) => !SURVIVORS_BOOKKEEPING_KEYS.some((bookkeeping) => bookkeeping === key))
        .sort()
      const inputUnchanged = isDeepStrictEqual(inputKeys, Object.keys(config)) &&
        inputKeys.every((key, index) => Object.is(config[key], inputValues[index]))
      return inputUnchanged &&
        isDeepStrictEqual(Object.keys(stripped).sort(), expectedKeys) &&
        expectedKeys.every((key) => Object.is(stripped[key], config[key]))
    })
  })

  describe('wasProducedBySurvivorsRun', () => {
    it.prop(
      '∀r_StrippedConfig_≡NeverSurvivorsProduced',
      [reportArb],
      ([report]) => !wasProducedBySurvivorsRun({ ...report, config: stripSurvivorsKeys(report.config) }),
    )
  })

  describe('admission hashing', () => {
    it.prop(
      '∀i_KeyOrder_≡SameSerialization',
      [hashInputArb],
      ([input]) => serializeSurvivorsHashInput(input) === serializeSurvivorsHashInput(permuteHashInput(input)),
    )

    it.prop('∀i_Serialization_≡LosslessRoundTrip', [hashInputArb], ([input]) =>
      isDeepStrictEqual(
        JSON.parse(serializeSurvivorsHashInput(input)),
        JSON.parse(JSON.stringify(input)),
      ))

    /**
     * Key order is not data. `sortKeys` is what makes the comparison a function of the
     * values, and the serialization is what the admission compares, so the invariance is
     * asserted on it directly rather than through a digest that could only hide a
     * difference behind a collision.
     */
    it.prop(
      '∀i_SerializationKeyOrder_≡SameText',
      [hashInputArb],
      ([input]) => serializeSurvivorsHashInput(input) === serializeSurvivorsHashInput(permuteHashInput(input)),
    )
  })

  describe('survivorIdentifyingKey', () => {
    it.prop(
      '∀k_OneFieldVariant_≡DifferentKey',
      [keyInputArb],
      ([base]) =>
        survivorIdentifyingKey({ ...base, file: nextKeyFile(base.file) }) !== survivorIdentifyingKey(base) &&
        survivorIdentifyingKey({ ...base, location: shiftedLocation(base.location) }) !==
          survivorIdentifyingKey(base) &&
        survivorIdentifyingKey({ ...base, mutatorName: `${base.mutatorName}x` }) !== survivorIdentifyingKey(base) &&
        survivorIdentifyingKey({ ...base, replacement: `${base.replacement ?? ''}x` }) !== survivorIdentifyingKey(base),
    )
  })

  describe('reportMutantToMutant', () => {
    it.prop(
      '∀fm_ReportMutant_≡ResolvedAndShifted',
      [fc.string({ maxLength: 12 }), mutantResultArb],
      ([file, mutant]) => {
        const out = reportMutantToMutant(file, mutant, absPath)
        return out.id === mutant.id &&
          out.fileName === absPath(file) &&
          out.mutatorName === mutant.mutatorName &&
          out.replacement === (mutant.replacement ?? mutant.mutatorName) &&
          out.location.start.line === mutant.location.start.line - 1 &&
          out.location.start.column === mutant.location.start.column - 1 &&
          out.location.end.line === mutant.location.end.line - 1 &&
          out.location.end.column === mutant.location.end.column - 1
      },
    )
  })

  describe('extractSurvivors', () => {
    it.prop('∀r_Extracted_≡SurvivedEntriesInOrder', [reportArb], ([report]) => {
      const abs = (file: string): string => `${ABS_WORK_ROOT}/${file}`
      const survivors = extractSurvivors(report, abs)
      const survivedEntries: { readonly file: string; readonly mutant: schema.MutantResult }[] = []
      for (const [file, fileResult] of Object.entries(report.files)) {
        for (const mutant of fileResult.mutants) {
          if (mutant.status === 'Survived') {
            survivedEntries.push({ file, mutant })
          }
        }
      }
      if (survivors.length !== survivedEntries.length) {
        return false
      }
      return survivedEntries.every((entry, index) => {
        const out = survivors[index]
        if (out === undefined) {
          return false
        }
        const source = entry.mutant
        return out.id === source.id &&
          out.fileName === abs(entry.file) &&
          out.mutatorName === source.mutatorName &&
          out.replacement === (source.replacement ?? source.mutatorName) &&
          out.location.start.line === source.location.start.line - 1 &&
          out.location.start.column === source.location.start.column - 1 &&
          out.location.end.line === source.location.end.line - 1 &&
          out.location.end.column === source.location.end.column - 1
      })
    })
  })

  describe('survivorMutateSpans', () => {
    it.prop('∀s_Spans_≡DeduplicatedFirstSeen', [survivorListArb], ([survivors]) => {
      const spanOf = (mutant: Mutant): string => {
        const { start, end } = mutant.location
        return `${toRelativeNormalizedFileName(mutant.fileName)}:${start.line + 1}:${start.column}-${
          end.line + 1
        }:${end.column}`
      }
      const output = survivorMutateSpans(survivors)
      const inputSpans = survivors.map(spanOf)
      const firstIndexOf = (span: string): number => inputSpans.indexOf(span)
      const noDuplicates = new Set(output).size === output.length
      const soundAndComplete = output.every((span) => inputSpans.includes(span)) &&
        inputSpans.every((span) => output.includes(span))
      let firstSeenOrder = true
      for (let index = 1; index < output.length; index++) {
        const prev = output[index - 1]
        const current = output[index]
        if (prev === undefined || current === undefined || firstIndexOf(prev) >= firstIndexOf(current)) {
          firstSeenOrder = false
          break
        }
      }
      return noDuplicates && soundAndComplete && firstSeenOrder
    })

    it.prop('∀s_SpanNumbers_≡OneBasedLinesZeroBasedColumns', [survivorListArb], ([survivors]) => {
      const relName = (file: string): string => toRelativeNormalizedFileName(file)
      const numberFrom = (value: string): number => Number(value)
      const spanOf = (mutant: Mutant): string => {
        const { start, end } = mutant.location
        return `${relName(mutant.fileName)}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
      }
      const output = survivorMutateSpans(survivors)
      const inputSpans = survivors.map(spanOf)
      return output.every((span) => {
        const match = /^(.+):(\d+):(\d+)-(\d+):(\d+)$/.exec(span)
        if (match === null) {
          return false
        }
        const [, fileText = '', lineText = '', colText = '', endLineText = '', endColText = ''] = match
        if (fileText === '') {
          return false
        }
        const source = survivors[inputSpans.indexOf(span)]
        if (source === undefined) {
          return false
        }
        return fileText === relName(source.fileName) &&
          numberFrom(lineText) === source.location.start.line + 1 &&
          numberFrom(colText) === source.location.start.column &&
          numberFrom(endLineText) === source.location.end.line + 1 &&
          numberFrom(endColText) === source.location.end.column
      })
    })
  })

  /**
   * `admissionVerdict` is the classification the workflow dispatches on, so the order of its
   * checks is a decision rather than a detail. A report can satisfy two rejecting conditions at
   * once, and only the order says which wins.
   *
   * One law, not a suite: measured defect by defect, reordering the hash check, dropping a file
   * from `priorSourceHashes` and losing the `no-report` precedence are each already red in
   * `Survivors.workflow.property.test.ts`, so laws for those would restate existing coverage.
   * Hoisting the emptiness check above the provenance check is the one defect that leaves that
   * whole suite green.
   */
  describe('admissionVerdict', () => {
    const survivorsProducedReport = (
      sources: Readonly<Record<string, string>>,
      survived: boolean,
    ): schema.MutationTestResult => ({
      config: { survivorsPriorReport: 'reports/prior.json' },
      schemaVersion: '1',
      thresholds: { high: 100, low: 100 },
      framework: { name: 'stryker', version: '1.0.0' },
      files: Object.fromEntries(
        Object.entries(sources).map(([name, source]) => [
          name,
          {
            language: 'javascript',
            source,
            mutants: [{
              id: 'm1',
              mutatorName: 'ObjectLiteral',
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
              status: survived ? ('Survived' as const) : ('Killed' as const),
            }],
          },
        ]),
      ),
    })

    const sourcesArb = fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string({ maxLength: 12 }), {
      minKeys: 1,
      maxKeys: 3,
    })

    /**
     * Provenance pre-empts emptiness (KTD7): a report produced by a survivors run is invalid
     * whatever it contains, so a self-consistent one with zero survivors still rejects rather
     * than succeeding with `no-survivors`.
     *
     * The hashes are deliberately absent: the provenance check must reject before anything
     * compares them, so supplying none both states that and keeps the per-case cost flat.
     */
    it.prop('∀r_SurvivorsSourced_→MismatchReject', [sourcesArb, fc.boolean()], ([sources, survived]) => {
      const prior = survivorsProducedReport(sources, survived)
      const verdict = admissionVerdict(
        AdmitSurvivorsRunCommand.make({
          priorReport: PriorReportFacts.make({
            config: prior.config ?? {},
            frameworkVersion: prior.framework?.version,
          }),
          currentConfig: prior.config ?? {},
          frameworkVersion: prior.framework?.version ?? '',
          sourceContentHashes: {},
          priorSourceHashes: {},
          priorSurvivors: [],
        }),
      )
      return verdict.kind === 'reject' && verdict.reason === 'mismatch' &&
        verdict.remediation.includes('itself produced by a --survivors run')
    })
  })

  /**
   * The codec's admission boundary. Effect owns the decoding; what is decided here is the
   * shape — which fields a report must carry and which it may omit — and each of these
   * would flip on a plausible tightening or loosening of that shape.
   */
  describe('decodePriorReport', () => {
    /**
     * Shape against admission. Effect owns the decoding; what is decided here is which
     * fields a report must carry and which it may omit, and every row flips on a
     * plausible tightening or loosening of that decision.
     */
    const admissionCases = [
      // `files` is the only field the precompute needs, so a report without one carries
      // nothing to admit.
      { raw: { config: {}, framework: { version: '1' } }, decodes: false },
      // Text that never parsed as JSON arrives as the text itself.
      { raw: 'not a report', decodes: false },
      // `config` and `framework` are absent from a report whose run recorded neither, so
      // requiring them would refuse a report the engine legitimately produced.
      { raw: { files: {} }, decodes: true },
      // The deliberate liberality: `status` is a bare string, so a report from an engine
      // that added a status decodes. Closing that set would refuse a newer report
      // wholesale rather than ignoring the one status it does not recognise.
      {
        raw: {
          files: {
            'src/a.ts': {
              source: 'x',
              mutants: [{
                id: 'A',
                mutatorName: 'm',
                status: 'SomeStatusThisEngineNeverHeardOf',
                location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
              }],
            },
          },
        },
        decodes: true,
      },
    ] as const

    it.prop(
      '∀r_ReportAdmission_≡Shape',
      [fc.constantFrom(...admissionCases)],
      ([expected]) => Result.isSuccess(decodePriorReport(expected.raw)) === expected.decodes,
    )
  })
}
