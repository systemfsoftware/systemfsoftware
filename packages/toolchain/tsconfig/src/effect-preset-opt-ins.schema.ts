import { Schema } from 'effect'

export const Role = Schema.Literals(['library', 'test'])
export type Role = typeof Role.Type

export const UnstableApiGrant = Schema.TaggedStruct('UnstableApi', {
  api: Schema.String,
  role: Schema.optional(Role),
})
export type UnstableApiGrant = typeof UnstableApiGrant.Type

export const DiagnosticExclusionGrant = Schema.TaggedStruct('DiagnosticExclusion', {
  diagnostic: Schema.String,
  role: Role,
})
export type DiagnosticExclusionGrant = typeof DiagnosticExclusionGrant.Type

export const PresetGrant = Schema.Union([UnstableApiGrant, DiagnosticExclusionGrant]).pipe(
  Schema.toTaggedUnion('_tag'),
)
export type PresetGrant = typeof PresetGrant.Type

export const PresetOptIn = Schema.Struct({
  name: Schema.String,
  reason: Schema.String,
  owner: Schema.String,
  grant: PresetGrant,
})
export type PresetOptIn = typeof PresetOptIn.Type
