import { Context, type Effect } from 'effect'
import type { PackageVersion, Visibility } from './CleanupPlan.schema.js'
import type { PackagesApiFailed } from './RegistryGateError.schema.js'

export class PackagesApi extends Context.Service<PackagesApi, {
  readonly visibility: Effect.Effect<Visibility, PackagesApiFailed>
  readonly versions: Effect.Effect<ReadonlyArray<PackageVersion>, PackagesApiFailed>
  readonly deleteVersion: (id: number) => Effect.Effect<void, PackagesApiFailed>
  readonly deletePackage: Effect.Effect<void, PackagesApiFailed>
  readonly versionGone: (id: number) => Effect.Effect<boolean, PackagesApiFailed>
  readonly packageGone: Effect.Effect<boolean, PackagesApiFailed>
}>()('@systemfsoftware/registry-gate/PackagesApi') {}
