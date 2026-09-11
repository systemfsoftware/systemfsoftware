import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

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

const isArray: (value: unknown) => value is unknown[] = Array.isArray
const { entries: objectEntries, fromEntries: objectFromEntries, keys: objectKeys } = Object
const stringify = JSON.stringify

const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'
const SURVIVORS_BOOKKEEPING_KEYS: readonly string[] = ['survivorsPriorReport']

function stripSurvivorsKeys(config: Record<string, unknown>): Record<string, unknown> {
  return objectFromEntries(
    objectEntries(config).filter(([key]) => !SURVIVORS_BOOKKEEPING_KEYS.includes(key)),
  )
}

function wasProducedBySurvivorsRun(priorReport: { readonly config: unknown }): boolean {
  return Option.exists(
    Option.liftPredicate(priorReport.config, Match.record),
    (config) => SURVIVORS_BOOKKEEPING_KEYS.some((bookkeeping) => bookkeeping in config),
  )
}

function serializeSurvivorsHashInput(input: {
  readonly resolvedOptions: Record<string, unknown>
  readonly frameworkVersion: string | undefined
  readonly sourceContentHashes: Readonly<Record<string, string>>
}): string {
  return stringify(sortKeys(input))
}

function sortKeys(value: unknown): unknown {
  return Match.value(value).pipe(
    Match.when(isArray, (many) => many.map((member) => sortKeys(member))),
    Match.when(Match.record, (named) =>
      objectFromEntries(
        objectKeys(named)
          .sort()
          .map((key): readonly [string, unknown] => [key, sortKeys(named[key])]),
      )),
    Match.orElse((leaf) => leaf),
  )
}
export class PriorReportFacts extends S.Class<PriorReportFacts>('PriorReportFacts')({
  config: S.Record(S.String, S.Unknown),
  frameworkVersion: S.UndefinedOr(S.String),
}) {}

export class AdmitSurvivorsRunCommand extends S.Class<AdmitSurvivorsRunCommand>('AdmitSurvivorsRunCommand')({
  priorReport: S.UndefinedOr(PriorReportFacts),
  currentConfig: S.Record(S.String, S.Unknown),
  frameworkVersion: S.String,
  sourceContentHashes: S.Record(S.String, S.String),
  priorSourceHashes: S.Record(S.String, S.String),
  priorSurvivors: S.Array(MutantShape),
}) {}

const NO_REPORT_DETAIL = 'No prior mutation report found — a --survivors run needs the report of a previous run.'
const SURVIVORS_RUN_SOURCE_DETAIL =
  'The prior mutation report was itself produced by a --survivors run, so it is not a valid input for another one.'
const MISMATCH_DETAIL =
  'The prior mutation report does not match the current run (resolved options, framework version, or source content differ).'

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

/**
 * The closed set of admissions a command can name, before any of them is turned
 * into a decision. Deriving the variant first keeps the decision itself a total
 * dispatch over a type rather than a fallback over predicates.
 */
const PriorReportAbsentOutcome = S.TaggedStruct('PriorReportAbsent', {})
const PriorReportIsSurvivorsRunOutcome = S.TaggedStruct('PriorReportIsSurvivorsRun', {})
const NoSurvivorsFoundOutcome = S.TaggedStruct('NoSurvivorsFound', {})
const PriorReportDriftedOutcome = S.TaggedStruct('PriorReportDrifted', {})
const SurvivorsMatchOutcome = S.TaggedStruct('SurvivorsMatch', { survivors: S.Array(MutantShape) })

const AdmissionOutcome = S.Union([
  PriorReportAbsentOutcome,
  PriorReportIsSurvivorsRunOutcome,
  NoSurvivorsFoundOutcome,
  PriorReportDriftedOutcome,
  SurvivorsMatchOutcome,
])
type AdmissionOutcome = S.Schema.Type<typeof AdmissionOutcome>

const ADMISSION_RULES: readonly {
  readonly holds: (input: AdmitSurvivorsRunCommand) => boolean
  readonly outcome: AdmissionOutcome
}[] = [
  {
    holds: (input) => input.priorReport === undefined,
    outcome: PriorReportAbsentOutcome.make({}),
  },
  {
    holds: (input) => Option.exists(Option.fromUndefinedOr(input.priorReport), wasProducedBySurvivorsRun),
    outcome: PriorReportIsSurvivorsRunOutcome.make({}),
  },
  {
    holds: (input) => input.priorSurvivors.length === 0,
    outcome: NoSurvivorsFoundOutcome.make({}),
  },
  {
    holds: (input) => Option.exists(Option.fromUndefinedOr(input.priorReport), (facts) => !hashesMatch(facts, input)),
    outcome: PriorReportDriftedOutcome.make({}),
  },
]

const admissionOutcomeOf = (input: AdmitSurvivorsRunCommand): AdmissionOutcome =>
  Option.getOrElse(
    Option.map(Arr.findFirst(ADMISSION_RULES, (rule) => rule.holds(input)), (rule) => rule.outcome),
    (): AdmissionOutcome => SurvivorsMatchOutcome.make({ survivors: input.priorSurvivors }),
  )

function decideAdmission(
  input: AdmitSurvivorsRunCommand,
): Result.Result<SurvivorsAdmission, SurvivorsRejection> {
  return Match.value(admissionOutcomeOf(input)).pipe(
    Match.tag('PriorReportAbsent', () => reject('no-report', NO_REPORT_DETAIL)),
    Match.tag('PriorReportIsSurvivorsRun', () => reject('mismatch', SURVIVORS_RUN_SOURCE_DETAIL)),
    Match.tag('NoSurvivorsFound', () => Result.succeed(NoSurvivors.make())),
    Match.tag('PriorReportDrifted', () => reject('mismatch', MISMATCH_DETAIL)),
    Match.tag('SurvivorsMatch', (matched) => Result.succeed(Admitted.make({ survivors: matched.survivors }))),
    Match.exhaustive,
  )
}

export const admitSurvivorsRun = Workflow.make(AdmitSurvivorsRunCommand, decideAdmission)
