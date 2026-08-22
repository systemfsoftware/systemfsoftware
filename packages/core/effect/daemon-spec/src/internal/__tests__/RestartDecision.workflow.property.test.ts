import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Array, Match, Option, Schema } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { DecideInput, type RestartStrategy } from '../RestartDecision.schema.js'
import { decideRestart, type RestartDecisionOutcome } from '../RestartDecision.workflow.js'

const tagOf = (
  e: RestartDecisionOutcome,
): string | null =>
  Match.value(e).pipe(
    Match.tag('Success', ({ success }) => success._tag),
    Match.tag('Failure', ({ failure }) => failure._tag),
    Match.exhaustive,
  )

const indicesOf = (
  e: RestartDecisionOutcome,
): readonly number[] | null =>
  Match.value(e).pipe(
    Match.tag(
      'Success',
      ({ success }) =>
        Match.value(success).pipe(
          Match.tag('Restart', (r) => r.indices),
          Match.tag('Continue', () => null),
          Match.exhaustive,
        ),
    ),
    Match.tag('Failure', () => null),
    Match.exhaustive,
  )

/**
 * The sampled command with named fields overridden, rebuilt through the class
 * constructor rather than spread from the instance. The decision's command channel
 * is the class itself, and spreading an instance drops its prototype — the result is
 * still structurally assignable, so nothing would fail, and the suite would quietly
 * stop exercising the command it claims to.
 *
 * `totalChildren` and `failedIndex` are never overridden, so the cross-field check
 * the sampled value already satisfies still holds at construction.
 */
const commandWith = (
  input: DecideInput,
  override: {
    readonly strategy?: RestartStrategy
    readonly exitSuccess?: boolean
    readonly intensityExceeded?: boolean
  },
): DecideInput =>
  DecideInput.make({
    strategy: override.strategy ?? input.strategy,
    totalChildren: input.totalChildren,
    failedIndex: input.failedIndex,
    exitSuccess: override.exitSuccess ?? input.exitSuccess,
    intensityExceeded: override.intensityExceeded ?? input.intensityExceeded,
  })

const RESTARTING = { exitSuccess: false, intensityExceeded: false } as const

describe('decideRestart — invariants', () => {
  it.prop(
    '→Succeeded_Exit_=Continue',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => tagOf(decideRestart(commandWith(input, { exitSuccess: true }))) === 'Continue',
  )

  it.prop(
    '→Failed∧Exceeded_Decide_=Exhausted',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) =>
      tagOf(decideRestart(commandWith(input, { exitSuccess: false, intensityExceeded: true }))) === 'Exhausted',
  )

  it.prop(
    '→Failed∧¬Exceeded_Decide_=Restart',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => tagOf(decideRestart(commandWith(input, RESTARTING))) === 'Restart',
  )

  it.prop(
    '→Restart_Indices_≠∅',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => {
      const indices = indicesOf(decideRestart(commandWith(input, RESTARTING)))
      return indices !== null && indices.length > 0
    },
  )
})

describe('decideRestart — restart index invariants', () => {
  it.prop(
    '→OneForOne_Indices_={Failed}',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => {
      const indices = indicesOf(decideRestart(commandWith(input, { ...RESTARTING, strategy: 'one_for_one' })))
      return indices !== null && indices.length === 1 && indices[0] === input.failedIndex
    },
  )

  it.prop(
    '→OneForAll_Indices_=All',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => {
      const indices = indicesOf(decideRestart(commandWith(input, { ...RESTARTING, strategy: 'one_for_all' })))
      return indices !== null &&
        indices.length === input.totalChildren &&
        indices[0] === 0 &&
        indices[indices.length - 1] === input.totalChildren - 1
    },
  )

  it.prop(
    '→RestForOne_Indices_=Failed..End',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => {
      const indices = indicesOf(decideRestart(commandWith(input, { ...RESTARTING, strategy: 'rest_for_one' })))
      return indices !== null &&
        indices.length === input.totalChildren - input.failedIndex &&
        indices[0] === input.failedIndex &&
        indices[indices.length - 1] === input.totalChildren - 1
    },
  )

  it.prop(
    '∀s_Indices_⊇Ascending',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) => {
      const indices = indicesOf(decideRestart(commandWith(input, RESTARTING)))
      if (indices === null) return false
      const strictlyIncreasing = indices.length <= 1 ||
        indices.every((value, idx) =>
          idx === 0 ||
          Option.match(Array.get(indices, idx - 1), {
            onNone: () => false,
            onSome: (prev) => value > prev,
          })
        )
      const withinRange = indices.every((idxVal) => idxVal >= 0 && idxVal < input.totalChildren)
      return strictlyIncreasing && withinRange
    },
  )
})
