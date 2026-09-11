import { Workflow } from '@systemfsoftware/effect-cell-types'
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
const { fromEntries: objectFromEntries, keys: objectKeys } = Object
const stringify = JSON.stringify

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !isArray(value)
}

const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'
const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const

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

function wasProducedBySurvivorsRun(priorReport: { readonly config: unknown }): boolean {
  const config = priorReport.config
  return isRecord(config) && 'survivorsPriorReport' in config
}

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
