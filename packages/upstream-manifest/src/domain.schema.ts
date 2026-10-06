import { Schema } from 'effect'

/** The JSON a manifest, tsconfig or dprint config may carry. */
export const Json = Schema.Json
export type Json = typeof Json.Type

export const Addition = Schema.Struct({
  option: Schema.String,
  value: Json,
  reason: Schema.String,
})
export type Addition = typeof Addition.Type

export const PortRegion = Schema.Struct({
  case: Schema.String,
  lines: Schema.Tuple([Schema.Finite, Schema.Finite]),
})
export type PortRegion = typeof PortRegion.Type

export const Ported = Schema.Struct({
  upstream: Schema.String,
  port: Schema.String,
  blob: Schema.String,
  reason: Schema.String,
  regions: Schema.Array(PortRegion),
})
export type Ported = typeof Ported.Type

export const Retired = Schema.Struct({
  upstream: Schema.String,
  reason: Schema.String,
  replacement: Schema.String,
})
export type Retired = typeof Retired.Type

/**
 * A suite run directly from a read-only subtree of this repository, never copied
 * into a member: the record names the subtree, the pinned upstream commit it was
 * vendored at, the files executed from it, and the vitest JSON report that shows
 * they were collected and executed.
 */
export const InPlace = Schema.Struct({
  subtree: Schema.String,
  commit: Schema.String,
  files: Schema.Array(Schema.String),
  report: Schema.String,
})
export type InPlace = typeof InPlace.Type

/** The subset of vitest's JSON reporter output the guard reads: one entry per test file. */
export const VitestReport = Schema.Struct({
  testResults: Schema.Array(Schema.Struct({
    name: Schema.String,
    assertionResults: Schema.Array(Schema.Struct({ status: Schema.String })),
  })),
})
export type VitestReport = typeof VitestReport.Type

export const Manifest = Schema.Struct({
  reason: Schema.String,
  removal: Schema.String,
  files: Schema.Array(Schema.String),
  ported: Schema.optional(Schema.Array(Ported)),
  retired: Schema.optional(Schema.Array(Retired)),
  inPlace: Schema.optional(Schema.Array(InPlace)),
  typecheck: Schema.optional(Schema.Struct({ additions: Schema.Array(Addition) })),
})
export type Manifest = typeof Manifest.Type

export const FamilyPackage = Schema.Struct({
  upstream: Schema.String,
  specifier: Schema.optional(Schema.String),
})
export type FamilyPackage = typeof FamilyPackage.Type

export const FamilyTypecheck = Schema.Struct({
  tsconfig: Schema.String,
  blob: Schema.String,
})
export type FamilyTypecheck = typeof FamilyTypecheck.Type

export const Family = Schema.Struct({
  name: Schema.String,
  reason: Schema.String,
  source: Schema.Struct({ ref: Schema.String, root: Schema.String }),
  tests: Schema.Union([Schema.Literal('all'), Schema.Array(Schema.String)]),
  packages: Schema.Record(Schema.String, FamilyPackage),
  typecheck: Schema.optional(FamilyTypecheck),
})
export type Family = typeof Family.Type

export const SOURCE_CONDITION = Schema.Literal('@systemfsoftware/source')

export const ExportsEntry = Schema.Union([
  Schema.String,
  Schema.Struct({ '@systemfsoftware/source': Schema.optional(Schema.String) }),
])
export type ExportsEntry = typeof ExportsEntry.Type

export const Exports = Schema.Record(Schema.String, ExportsEntry)
export type Exports = typeof Exports.Type

export const PackageManifest = Schema.Struct({
  name: Schema.String,
  exports: Schema.optional(Exports),
})
export type PackageManifest = typeof PackageManifest.Type

export const FamilyResult = Schema.Struct({
  failed: Schema.Finite,
  unformatted: Schema.Array(Schema.String),
  claimed: Schema.Array(Schema.String),
})
export type FamilyResult = typeof FamilyResult.Type

export const DprintConfig = Schema.Struct({ excludes: Schema.Array(Schema.String) })
export type DprintConfig = typeof DprintConfig.Type

export const Tsconfig = Schema.Struct({ compilerOptions: Schema.optional(Schema.Record(Schema.String, Json)) })
export type Tsconfig = typeof Tsconfig.Type

export const ListVerdict = Schema.Union([
  Schema.TaggedStruct('Matches', {}),
  Schema.TaggedStruct('Drifted', {
    extra: Schema.Array(Schema.String),
    missing: Schema.Array(Schema.String),
  }),
])
export type ListVerdict = typeof ListVerdict.Type

export const PortVerdict = Schema.Union([
  Schema.TaggedStruct('Faithful', {}),
  Schema.TaggedStruct('Unmarked', {}),
  Schema.TaggedStruct('Changed', { line: Schema.Finite }),
])
export type PortVerdict = typeof PortVerdict.Type

export const Selection = Schema.Union([
  Schema.TaggedStruct('Selected', { tests: Schema.Array(Schema.String) }),
  Schema.TaggedStruct('Absent', { missing: Schema.Array(Schema.String) }),
])
export type Selection = typeof Selection.Type

export const Member = Schema.Struct({
  key: Schema.String,
  dir: Schema.String,
  specifier: Schema.String,
  exports: Exports,
})
export type Member = typeof Member.Type

export const SolutionProject = Schema.Struct({
  references: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String }))),
})
export type SolutionProject = typeof SolutionProject.Type

export const UpstreamTestProject = Schema.Struct({
  $schema: Schema.String,
  compilerOptions: Schema.Record(Schema.String, Json),
  include: Schema.Array(Schema.String),
})
export type UpstreamTestProject = typeof UpstreamTestProject.Type

export const RepoTestProject = Schema.Record(Schema.String, Json)
export type RepoTestProject = typeof RepoTestProject.Type

export const ReferencedProject = Schema.Array(Schema.Struct({ path: Schema.String }))
export type ReferencedProject = typeof ReferencedProject.Type
