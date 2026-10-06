import { Schema } from 'effect'

export const Role = Schema.Literals(['library', 'test'])
export type Role = typeof Role.Type

export const OptInName = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)),
  Schema.brand('@systemfsoftware/opt-in/OptInName'),
)
export type OptInName = typeof OptInName.Type

export const Owner = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/)),
  Schema.brand('@systemfsoftware/opt-in/Owner'),
)
export type Owner = typeof Owner.Type

export const Reason = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\S(?:[\s\S]*\S)?$/)),
  Schema.check(Schema.isMinLength(10)),
  Schema.brand('@systemfsoftware/opt-in/Reason'),
)
export type Reason = typeof Reason.Type

export const OxlintRule = Schema.TaggedStruct('OxlintRule', {
  rule: Schema.String,
  files: Schema.NonEmptyArray(Schema.String),
  options: Schema.Array(Schema.Unknown),
})
export type OxlintRule = typeof OxlintRule.Type

export const OxlintExclusion = Schema.TaggedStruct('OxlintExclusion', {
  rule: Schema.String,
  files: Schema.NonEmptyArray(Schema.String),
})
export type OxlintExclusion = typeof OxlintExclusion.Type

export const DiagnosticExclusion = Schema.TaggedStruct('DiagnosticExclusion', {
  diagnostic: Schema.String,
  role: Role,
  files: Schema.NonEmptyArray(Schema.String),
})
export type DiagnosticExclusion = typeof DiagnosticExclusion.Type

export const UnstableApi = Schema.TaggedStruct('UnstableApi', {
  api: Schema.String,
  role: Schema.optional(Role),
})
export type UnstableApi = typeof UnstableApi.Type

export const ExperimentalApi = Schema.TaggedStruct('ExperimentalApi', {
  api: Schema.String,
  role: Schema.optional(Role),
})
export type ExperimentalApi = typeof ExperimentalApi.Type

export const DuplicatePackage = Schema.TaggedStruct('DuplicatePackage', {
  package: Schema.String,
})
export type DuplicatePackage = typeof DuplicatePackage.Type

export const VitestGuardExemption = Schema.TaggedStruct('VitestGuardExemption', {
  projects: Schema.Union([Schema.Literal('*'), Schema.NonEmptyArray(Schema.String)]),
  registrar: Schema.String,
})
export type VitestGuardExemption = typeof VitestGuardExemption.Type

export const LintIgnore = Schema.TaggedStruct('LintIgnore', {
  patterns: Schema.NonEmptyArray(Schema.String),
})
export type LintIgnore = typeof LintIgnore.Type

export const BuildWarning = Schema.TaggedStruct('BuildWarning', {
  pattern: Schema.String,
})
export type BuildWarning = typeof BuildWarning.Type

export const TypeRefusalFixtures = Schema.TaggedStruct('TypeRefusalFixtures', {
  files: Schema.NonEmptyArray(Schema.String),
})
export type TypeRefusalFixtures = typeof TypeRefusalFixtures.Type

export const TestProcessSpawn = Schema.TaggedStruct('TestProcessSpawn', {
  files: Schema.NonEmptyArray(Schema.String),
  rule: Schema.String,
})
export type TestProcessSpawn = typeof TestProcessSpawn.Type

export const PresetNarrowing = Schema.TaggedStruct('PresetNarrowing', {
  rule: Schema.String,
  files: Schema.Array(Schema.String),
})
export type PresetNarrowing = typeof PresetNarrowing.Type

export const PassWithNoTests = Schema.TaggedStruct('PassWithNoTests', {})
export type PassWithNoTests = typeof PassWithNoTests.Type

const TrimmedNonEmpty = /^\S(?:[\s\S]*\S)?$/

export const PatchDependency = Schema.String.pipe(
  Schema.check(Schema.isPattern(TrimmedNonEmpty)),
  Schema.check(Schema.isMinLength(3)),
  Schema.brand('@systemfsoftware/opt-in/PatchDependency'),
)
export type PatchDependency = typeof PatchDependency.Type

export const PatchPath = Schema.String.pipe(
  Schema.check(Schema.isPattern(TrimmedNonEmpty)),
  Schema.check(Schema.isMinLength(3)),
  Schema.brand('@systemfsoftware/opt-in/PatchPath'),
)
export type PatchPath = typeof PatchPath.Type

export const PatchRecheck = Schema.String.pipe(
  Schema.check(Schema.isPattern(TrimmedNonEmpty)),
  Schema.check(Schema.isMinLength(10)),
  Schema.brand('@systemfsoftware/opt-in/PatchRecheck'),
)
export type PatchRecheck = typeof PatchRecheck.Type

export const ThirdPartyPatch = Schema.TaggedStruct('ThirdPartyPatch', {
  dependency: PatchDependency,
  patch: PatchPath,
  recheck: PatchRecheck,
})
export type ThirdPartyPatch = typeof ThirdPartyPatch.Type

export const Grant = Schema.Union([
  OxlintRule,
  OxlintExclusion,
  DiagnosticExclusion,
  UnstableApi,
  ExperimentalApi,
  DuplicatePackage,
  VitestGuardExemption,
  LintIgnore,
  BuildWarning,
  TypeRefusalFixtures,
  TestProcessSpawn,
  PresetNarrowing,
  ThirdPartyPatch,
  PassWithNoTests,
]).pipe(Schema.toTaggedUnion('_tag'))
export type Grant = typeof Grant.Type

export class OptIn extends Schema.Class<OptIn>('OptIn')({
  name: OptInName,
  reason: Reason,
  owner: Owner,
  grant: Grant,
}) {}

export const OptIns = Schema.Array(OptIn)
export type OptIns = typeof OptIns.Type

export const OptInsModule = Schema.Struct({
  default: Schema.optional(Schema.Unknown),
  optIns: Schema.optional(Schema.Unknown),
})
export type OptInsModule = typeof OptInsModule.Type
