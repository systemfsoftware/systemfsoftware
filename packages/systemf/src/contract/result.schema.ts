import { Schema } from 'effect'

export const ApiVersion = Schema.Literal(1)
export type ApiVersion = typeof ApiVersion.Type

export const ResultType = Schema.Literals(['check', 'unit.list', 'unit.show', 'manifest'])
export type ResultType = typeof ResultType.Type

export const ErrorCode = Schema.Literals([
  'ERR_UNKNOWN',
  'ERR_UNKNOWN_COMMAND',
  'ERR_INVALID_OPTION',
  'ERR_INVALID_ARGUMENT',
  'ERR_MISSING_ARGUMENT',
  'ERR_NOT_A_PACKAGE',
  'ERR_TSCONFIG_NOT_FOUND',
  'ERR_UNKNOWN_RULE',
  'ERR_UNKNOWN_UNIT',
  'ERR_AMBIGUOUS_UNIT',
])
export type ErrorCode = typeof ErrorCode.Type

export const RuleId = Schema.Literals(['stop-coverage', 'conformance-lane', 'sources-readable'])
export type RuleId = typeof RuleId.Type

export const UnitKindName = Schema.Literals(['cell', 'blueprint', 'handle', 'medium'])
export type UnitKindName = typeof UnitKindName.Type

export const Coverage = Schema.Literals(['direct', 'through-declarations', 'none'])
export type Coverage = typeof Coverage.Type

export const ReachMode = Schema.Literals(['direct', 'through-declarations'])
export type ReachMode = typeof ReachMode.Type

export const Finding = Schema.Struct({
  rule: RuleId,
  file: Schema.String,
  declarations: Schema.Array(Schema.String),
  message: Schema.String,
  fix: Schema.String,
})
export type Finding = typeof Finding.Type

export const Reach = Schema.Struct({
  file: Schema.String,
  line: Schema.Finite,
  mode: ReachMode,
  via: Schema.String,
})
export type Reach = typeof Reach.Type

export const CheckedPackage = Schema.Struct({
  package: Schema.String,
  root: Schema.String,
  enrolled: Schema.Finite,
  linked: Schema.Finite,
  direct: Schema.Finite,
  transitive: Schema.Finite,
  findings: Schema.Array(Finding),
})
export type CheckedPackage = typeof CheckedPackage.Type

export const CheckSummary = Schema.Struct({
  packages: Schema.Finite,
  units: Schema.Finite,
  findings: Schema.Finite,
})
export type CheckSummary = typeof CheckSummary.Type

export const CheckData = Schema.Struct({
  packages: Schema.Array(CheckedPackage),
  findings: Schema.Array(Finding),
  summary: CheckSummary,
})
export type CheckData = typeof CheckData.Type

export const UnitRow = Schema.Struct({
  package: Schema.String,
  module: Schema.String,
  kind: UnitKindName,
  declarations: Schema.Array(Schema.String),
  coverage: Coverage,
})
export type UnitRow = typeof UnitRow.Type

export const UnitListData = Schema.Struct({ units: Schema.Array(UnitRow) })
export type UnitListData = typeof UnitListData.Type

export const UnitShowData = Schema.Struct({
  package: Schema.String,
  module: Schema.String,
  kind: UnitKindName,
  declarations: Schema.Array(Schema.String),
  reaches: Schema.Array(Reach),
  fix: Schema.optional(Schema.String),
})
export type UnitShowData = typeof UnitShowData.Type

export const ManifestExample = Schema.Struct({
  command: Schema.String,
  description: Schema.optional(Schema.String),
})
export type ManifestExample = typeof ManifestExample.Type

export const ManifestFlag = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  type: Schema.String,
  description: Schema.optional(Schema.String),
  required: Schema.Boolean,
})
export type ManifestFlag = typeof ManifestFlag.Type

export const ManifestArgument = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  description: Schema.optional(Schema.String),
  required: Schema.Boolean,
  variadic: Schema.Boolean,
})
export type ManifestArgument = typeof ManifestArgument.Type

export const ManifestCommand = Schema.Struct({
  path: Schema.Array(Schema.String),
  description: Schema.String,
  flags: Schema.Array(ManifestFlag),
  arguments: Schema.Array(ManifestArgument),
  examples: Schema.Array(ManifestExample),
  resultTypes: Schema.Array(ResultType),
})
export type ManifestCommand = typeof ManifestCommand.Type

export const ExitCodeInfo = Schema.Struct({ code: Schema.Finite, meaning: Schema.String })
export type ExitCodeInfo = typeof ExitCodeInfo.Type

export const ErrorCodeInfo = Schema.Struct({ code: ErrorCode, meaning: Schema.String })
export type ErrorCodeInfo = typeof ErrorCodeInfo.Type

export const ManifestData = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  description: Schema.String,
  globalFlags: Schema.Array(ManifestFlag),
  commands: Schema.Array(ManifestCommand),
  exitCodes: Schema.Array(ExitCodeInfo),
  errorCodes: Schema.Array(ErrorCodeInfo),
})
export type ManifestData = typeof ManifestData.Type

export const CheckEnvelope = Schema.Struct({
  apiVersion: ApiVersion,
  type: Schema.Literal('check'),
  data: CheckData,
})
export type CheckEnvelope = typeof CheckEnvelope.Type

export const UnitListEnvelope = Schema.Struct({
  apiVersion: ApiVersion,
  type: Schema.Literal('unit.list'),
  data: UnitListData,
})
export type UnitListEnvelope = typeof UnitListEnvelope.Type

export const UnitShowEnvelope = Schema.Struct({
  apiVersion: ApiVersion,
  type: Schema.Literal('unit.show'),
  data: UnitShowData,
})
export type UnitShowEnvelope = typeof UnitShowEnvelope.Type

export const ManifestEnvelope = Schema.Struct({
  apiVersion: ApiVersion,
  type: Schema.Literal('manifest'),
  data: ManifestData,
})
export type ManifestEnvelope = typeof ManifestEnvelope.Type

export const ErrorEnvelope = Schema.Struct({
  apiVersion: ApiVersion,
  error: Schema.String,
  code: ErrorCode,
  suggestions: Schema.optional(Schema.Array(Schema.String)),
})
export type ErrorEnvelope = typeof ErrorEnvelope.Type

export const Response = Schema.Union([
  CheckEnvelope,
  UnitListEnvelope,
  UnitShowEnvelope,
  ManifestEnvelope,
  ErrorEnvelope,
])
export type Response = typeof Response.Type
