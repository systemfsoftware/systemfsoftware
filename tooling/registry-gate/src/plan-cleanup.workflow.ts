import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { CleanupPlan, DeletePackage, DeleteVersion, NothingPublished, PackageVersion } from './CleanupPlan.schema.js'

export class PlanCleanup extends Schema.TaggedClass<PlanCleanup>()('PlanCleanup', {
  version: Schema.String,
  versions: Schema.Array(PackageVersion),
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    version: 'registry_gate.canary.version',
  } as const
}

const planFor = (published: PackageVersion, versionCount: number): CleanupPlan =>
  Match.value(versionCount).pipe(
    Match.when(1, () => new DeletePackage({})),
    Match.orElse(() => new DeleteVersion({ id: published.id })),
  )

const planOf = (command: PlanCleanup): CleanupPlan =>
  Option.match(Option.fromNullishOr(command.versions.find((listed) => listed.name === command.version)), {
    onNone: () => new NothingPublished({}),
    onSome: (published) => planFor(published, command.versions.length),
  })

export const planCleanup = Workflow.make({
  command: PlanCleanup,
  decision: CleanupPlan,
  error: Schema.Never,
  decide: (command): Result.Result<CleanupPlan, never> => Result.succeed(planOf(command)),
})
