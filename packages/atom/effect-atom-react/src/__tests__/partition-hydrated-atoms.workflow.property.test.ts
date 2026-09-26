import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Option, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  DeferUntilCommit,
  HydrateDuringRender,
  PartitionHydratedAtoms,
  partitionHydratedAtoms,
  type PartitionHydratedAtomsDecision,
} from '../partition-hydrated-atoms.workflow.js'

const decide = (
  knownKeys: ReadonlyArray<string>,
  dehydratedKeys: ReadonlyArray<string>,
): Result.Result<PartitionHydratedAtomsDecision, never> =>
  partitionHydratedAtoms(PartitionHydratedAtoms.make({ knownKeys, dehydratedKeys }))

const decisionsOf = (outcome: Result.Result<PartitionHydratedAtomsDecision, never>): PartitionHydratedAtomsDecision =>
  Result.match(outcome, {
    onFailure: (error: never): PartitionHydratedAtomsDecision => absurd(error),
    onSuccess: (decision) => decision,
  })

it.prop(
  '∀k_KnownKey_≡Deferred',
  { of: [Schema.Array(Schema.String), Schema.String], subject: decide },
  (subject, [knownKeys, key]) => {
    const decisions = subject([...knownKeys, key], [key]).pipe(decisionsOf)
    return decisions.length === 1 &&
      Option.match(Arr.head(decisions), {
        onNone: () => false,
        onSome: (decision) => Schema.is(DeferUntilCommit)(decision) && decision.key === key,
      })
  },
)

it.prop(
  '∀k_AbsentKey_≡HydratedDuringRender',
  { of: [Schema.Array(Schema.String), Schema.String], subject: decide },
  (subject, [knownKeys, key]) => {
    if (knownKeys.includes(key)) {
      return true
    }
    const decisions = subject(knownKeys, [key]).pipe(decisionsOf)
    return decisions.length === 1 &&
      Option.match(Arr.head(decisions), {
        onNone: () => false,
        onSome: (decision) => Schema.is(HydrateDuringRender)(decision) && decision.key === key,
      })
  },
)
