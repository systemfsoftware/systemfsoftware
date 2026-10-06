import { Schema } from 'effect'

export const InlineDirectiveFamily = Schema.Literals([
  'oxlint-disable',
  'eslint-disable',
  'effect-diagnostics',
  'ts-ignore',
  'ts-expect-error',
  'ts-nocheck',
  'stryker-disable',
  'coverage-ignore',
  'dprint-ignore',
])
export type InlineDirectiveFamily = typeof InlineDirectiveFamily.Type

export const InlineDirective = Schema.TaggedStruct('InlineDirective', {
  file: Schema.String,
  line: Schema.Int,
  family: InlineDirectiveFamily,
  text: Schema.String,
})
export type InlineDirective = typeof InlineDirective.Type

export const RustAttributeName = Schema.Literals(['allow', 'expect', 'ignore'])
export type RustAttributeName = typeof RustAttributeName.Type

export const RustAttribute = Schema.TaggedStruct('RustAttribute', {
  file: Schema.String,
  line: Schema.Int,
  attribute: RustAttributeName,
  path: Schema.String,
})
export type RustAttribute = typeof RustAttribute.Type

export const SkippedTestKind = Schema.Literals(['skip', 'only', 'todo', 'xit', 'xdescribe', 'skipIf', 'runIf'])
export type SkippedTestKind = typeof SkippedTestKind.Type

export const SkippedTest = Schema.TaggedStruct('SkippedTest', {
  file: Schema.String,
  line: Schema.Int,
  kind: SkippedTestKind,
  name: Schema.String,
})
export type SkippedTest = typeof SkippedTest.Type

export const MarkerTag = Schema.Literals(['TODO', 'FIXME', 'HACK', 'XXX'])
export type MarkerTag = typeof MarkerTag.Type

export const Marker = Schema.TaggedStruct('Marker', {
  file: Schema.String,
  line: Schema.Int,
  tag: MarkerTag,
  text: Schema.String,
})
export type Marker = typeof Marker.Type

export const ConfigChannel = Schema.Literals([
  'oxlint-rule',
  'oxlint-category',
  'tsgo-diagnostic',
  'vitest-config',
  'stryker-config',
])
export type ConfigChannel = typeof ConfigChannel.Type

export const Role = Schema.Literals(['library', 'test'])
export type Role = typeof Role.Type

export const ConfigSeverity = Schema.TaggedStruct('ConfigSeverity', {
  file: Schema.String,
  channel: ConfigChannel,
  scope: Schema.String,
  value: Schema.String,
  files: Schema.Array(Schema.String),
  role: Schema.optional(Role),
})
export type ConfigSeverity = typeof ConfigSeverity.Type

export const DeclaredGrant = Schema.TaggedStruct('Grant', {
  package: Schema.String,
  name: Schema.String,
  reason: Schema.String,
  owner: Schema.String,
  variant: Schema.String,
})
export type DeclaredGrant = typeof DeclaredGrant.Type

export const Patch = Schema.TaggedStruct('Patch', {
  file: Schema.String,
  dependency: Schema.String,
  patch: Schema.String,
})
export type Patch = typeof Patch.Type

export const Entry = Schema.Union([
  InlineDirective,
  RustAttribute,
  SkippedTest,
  Marker,
  ConfigSeverity,
  DeclaredGrant,
  Patch,
])
  .pipe(Schema.toTaggedUnion('_tag'))
export type Entry = typeof Entry.Type
export type EntryKind = Entry['_tag']

export const Declared = Schema.TaggedStruct('Declared', {
  name: Schema.String,
  reason: Schema.String,
  owner: Schema.String,
  recheck: Schema.optional(Schema.String),
})
export type Declared = typeof Declared.Type

export const Undeclared = Schema.TaggedStruct('Undeclared', { why: Schema.String })
export type Undeclared = typeof Undeclared.Type

export const Stale = Schema.TaggedStruct('Stale', { why: Schema.String })
export type Stale = typeof Stale.Type

export const Status = Schema.Union([Declared, Undeclared, Stale]).pipe(Schema.toTaggedUnion('_tag'))
export type Status = typeof Status.Type

export const LedgerEntry = Schema.Struct({
  id: Schema.String,
  entry: Entry,
  status: Status,
})
export type LedgerEntry = typeof LedgerEntry.Type
