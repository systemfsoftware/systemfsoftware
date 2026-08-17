/**
 * Teardown-workflow properties (R5): the plan-remainder law against an
 * independently-written applicability table, the exemption law, and the two
 * contradiction classes — all over generated facts.
 *
 * Predicates are pure booleans — no `expect` inside a property.
 */
import { it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck as fc } from 'effect/testing'

import { decideTeardown, TEARDOWN_STEP_ORDER, type TeardownStep } from '../teardown.workflow.js'

type Facts = {
  readonly keepAlive: boolean
  readonly adopted: boolean
  readonly created: boolean
  readonly networkId: string | undefined
  readonly isLastNetworkMember: boolean
  readonly syncCleanupRegistered: boolean
  readonly ledgerTracked: boolean
  readonly portsIssued: boolean
  readonly k: number
}

const factsArb = fc.record({
  keepAlive: fc.boolean(),
  adopted: fc.boolean(),
  created: fc.boolean(),
  networkId: fc.option(fc.string(), { nil: undefined }),
  isLastNetworkMember: fc.boolean(),
  syncCleanupRegistered: fc.boolean(),
  ledgerTracked: fc.boolean(),
  portsIssued: fc.boolean(),
  k: fc.integer({ min: 0, max: TEARDOWN_STEP_ORDER.length }),
})

/** The applicability table, written here independently of the kernel. */
const applicableInOrder = (facts: Facts): readonly TeardownStep[] =>
  TEARDOWN_STEP_ORDER.filter((step): boolean => {
    switch (step) {
      case 'stop':
      case 'remove':
        return facts.created
      case 'network-remove':
        return facts.networkId !== undefined && facts.isLastNetworkMember
      case 'sync-unregister':
        return facts.syncCleanupRegistered
      case 'untrack':
        return facts.ledgerTracked
      case 'release-ports':
        return facts.portsIssued
    }
  })

it.prop('∀facts_PlanRemainder_=SuffixOfApplicable', [factsArb], ([facts]) => {
  const exempt = facts.keepAlive || facts.adopted
  if (exempt) {
    return true
  }
  const applicable = applicableInOrder(facts)
  const completed = applicable.slice(0, Math.min(facts.k, applicable.length))
  const outcome = decideTeardown({ _tag: 'TearDown', ...facts, completed })
  if (!Result.isSuccess(outcome)) {
    return false
  }
  const decision = outcome.success
  const remaining = applicable.slice(completed.length)
  if (remaining.length === 0) {
    return decision._tag === 'Completed'
  }
  if (decision._tag !== 'Steps') {
    return false
  }
  const steps = decision.steps
  return steps.length === remaining.length && steps.every((step, index) => step === remaining[index])
})

it.prop('∀facts_ExemptWithoutSteps_→Skipped', [factsArb], ([facts]) => {
  if (!(facts.keepAlive || facts.adopted)) {
    return true
  }
  const outcome = decideTeardown({ _tag: 'TearDown', ...facts, completed: [] })
  return Result.isSuccess(outcome) && outcome.success._tag === 'Skipped'
})

it.prop('∀facts_ExemptWithSteps_→Contradiction', [factsArb], ([facts]) => {
  if (!(facts.keepAlive || facts.adopted)) {
    return true
  }
  const outcome = decideTeardown({ _tag: 'TearDown', ...facts, completed: ['stop'] })
  return Result.isFailure(outcome) && outcome.failure._tag === 'TeardownFactContradictionError'
})

it.prop('∀facts_NonInitialSegment_→Contradiction', [factsArb], ([facts]) => {
  if (facts.keepAlive || facts.adopted) {
    return true
  }
  const applicable = applicableInOrder(facts)
  if (applicable.length < 2) {
    return true
  }
  // The one-step-late segment: valid facts whose completed list skips the
  // first applicable step — never an initial segment.
  const skipped: ReadonlyArray<TeardownStep> = applicable.length >= 2 ? applicable.slice(1, 2) : ['release-ports']
  const outcome = decideTeardown({ _tag: 'TearDown', ...facts, completed: skipped })
  return Result.isFailure(outcome) && outcome.failure._tag === 'TeardownFactContradictionError'
})
