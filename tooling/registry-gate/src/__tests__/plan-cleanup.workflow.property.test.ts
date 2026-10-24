import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { DeletePackage, DeleteVersion, NothingPublished } from '../CleanupPlan.schema.js'
import { PlanCleanup, planCleanup } from '../plan-cleanup.workflow.js'

it.prop(
  '∀p_NothingPublished_≡VersionUnlisted',
  { of: [PlanCleanup], subject: planCleanup },
  (plan, [command]) =>
    Result.match(plan(command), {
      onFailure: () => false,
      onSuccess: (cleanup) =>
        Schema.is(NothingPublished)(cleanup) === !command.versions.some((listed) => listed.name === command.version),
    }),
)

it.prop(
  '∀p_DeletedVersionId_∈IdsListedUnderTheVersion',
  { of: [PlanCleanup], subject: planCleanup },
  (plan, [command]) =>
    Result.match(plan(command), {
      onFailure: () => false,
      onSuccess: (cleanup) =>
        !Schema.is(DeleteVersion)(cleanup) ||
        (command.versions.length > 1 &&
          command.versions.some((listed) => listed.id === cleanup.id && listed.name === command.version)),
    }),
)

it.prop(
  '∀p_DeletePackage_→TheOnlyListedVersion',
  { of: [PlanCleanup], subject: planCleanup },
  (plan, [command]) =>
    Result.match(plan(command), {
      onFailure: () => false,
      onSuccess: (cleanup) =>
        Schema.is(DeletePackage)(cleanup) ===
          (command.versions.length === 1 && command.versions.some((listed) => listed.name === command.version)),
    }),
)
