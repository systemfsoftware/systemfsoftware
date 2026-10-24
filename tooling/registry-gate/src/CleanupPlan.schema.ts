import { Schema } from 'effect'

const CleanupPlanTypeId: unique symbol = Symbol.for('@systemfsoftware/registry-gate/CleanupPlan')
type CleanupPlanTypeId = typeof CleanupPlanTypeId

export const PackageVersion = Schema.Struct({ id: Schema.Int, name: Schema.String })
export type PackageVersion = typeof PackageVersion.Type

export const PackageVersions = Schema.Array(PackageVersion)
export type PackageVersions = typeof PackageVersions.Type

export const Visibility = Schema.Literals(['private', 'public', 'internal'])
export type Visibility = typeof Visibility.Type

export const PackageSummary = Schema.Struct({ visibility: Visibility })
export type PackageSummary = typeof PackageSummary.Type

export class DeleteVersion extends Schema.TaggedClass<DeleteVersion>()('DeleteVersion', {
  id: Schema.Int,
}) {
  readonly [CleanupPlanTypeId] = CleanupPlanTypeId
}

export class DeletePackage extends Schema.TaggedClass<DeletePackage>()('DeletePackage', {}) {
  readonly [CleanupPlanTypeId] = CleanupPlanTypeId
}

export class NothingPublished extends Schema.TaggedClass<NothingPublished>()('NothingPublished', {}) {
  readonly [CleanupPlanTypeId] = CleanupPlanTypeId
}

export const CleanupPlan = Schema.Union([DeleteVersion, DeletePackage, NothingPublished])
export type CleanupPlan = typeof CleanupPlan.Type
