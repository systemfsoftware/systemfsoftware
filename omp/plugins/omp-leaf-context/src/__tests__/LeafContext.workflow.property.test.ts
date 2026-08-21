/**
 * LeafContext workflow — property tests over the closed classification.
 *
 * The decision is a `Workflow.make` value from the cell library; these laws
 * hold over the closed domain of command states it can be given, so every
 * arm of `classify` — the single source `decide` dispatches on — is
 * exercised: no leaf, invalid leaf path, self-touch, already-used, and the
 * ready `Select`.
 */
import { it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { classify, decide, type LeafContextCommand, LeafContextError, Select, Skip } from '../LeafContext.js'

const LEAF = 'packages/effect-atom/AGENTS.md'
const OTHER_TARGET = 'packages/effect-atom/src/index.ts'

const invalidLeaves = fc.constantFrom(
  '../escape/AGENTS.md',
  '/absolute/AGENTS.md',
  'repos/oh-my-pi/AGENTS.md',
  'packages/plain.txt',
  'AGENTS.md',
)

it.prop('∀leaf_InvalidLeafPath_∈Error', [invalidLeaves], ([leaf]) => {
  const outcome = decide({ relTarget: OTHER_TARGET, governingLeaf: leaf, injected: new Set<string>() })
  return Result.isFailure(outcome) && outcome.failure instanceof LeafContextError
})

it.prop('∀used_UsedLeaf_→decision', [fc.boolean()], ([used]) => {
  const injected = new Set(used ? [LEAF] : [])
  const outcome = decide({ relTarget: OTHER_TARGET, governingLeaf: LEAF, injected })
  if (Result.isFailure(outcome)) return false
  return used ? outcome.success instanceof Skip : outcome.success instanceof Select && outcome.success.leaf === LEAF
})

const commands = fc.constantFrom<LeafContextCommand>(
  { relTarget: OTHER_TARGET, governingLeaf: LEAF, injected: new Set<string>() },
  { relTarget: LEAF, governingLeaf: LEAF, injected: new Set<string>() },
  { relTarget: OTHER_TARGET, governingLeaf: null, injected: new Set<string>() },
  { relTarget: OTHER_TARGET, governingLeaf: LEAF, injected: new Set([LEAF]) },
  { relTarget: OTHER_TARGET, governingLeaf: '../escape/AGENTS.md', injected: new Set<string>() },
)

it.prop('∀cmd_ClassifyDecide_≡classify', [commands], ([command]) => {
  const classified = classify(command)
  const outcome = decide(command)
  if (Result.isSuccess(outcome)) {
    if (classified._tag === 'Ready') {
      return outcome.success instanceof Select && outcome.success.leaf === classified.leaf
    }
    return outcome.success instanceof Skip
  }
  return classified._tag === 'InvalidLeafPath' && outcome.failure.leaf === classified.leaf
})
