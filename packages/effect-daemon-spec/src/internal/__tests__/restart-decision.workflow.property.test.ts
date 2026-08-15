import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Array, Match, Option } from 'effect'
import { DecideInput } from '../restart-decision.schema.js'
import { decideRestart, type RestartDecisionWorkflow } from '../restart-decision.workflow.js'

const tagOf = (
  e: ReturnType<RestartDecisionWorkflow>,
): string | null =>
  Match.value(e).pipe(
    Match.tag('Right', ({ right }) => right._tag),
    Match.tag('Left', ({ left }) => left._tag),
    Match.exhaustive,
  )

const indicesOf = (
  e: ReturnType<RestartDecisionWorkflow>,
): readonly number[] | null =>
  Match.value(e).pipe(
    Match.tag(
      'Right',
      ({ right }) =>
        Match.value(right).pipe(
          Match.tag('Restart', (r) => r.indices),
          Match.tag('Continue', () => null),
          Match.exhaustive,
        ),
    ),
    Match.tag('Left', () => null),
    Match.exhaustive,
  )

describe('decideRestart — invariants', () => {
  it.prop(
    '→Succeeded_Exit_=Continue',
    [DecideInput],
    ([input]) => tagOf(decideRestart({ ...input, exitSuccess: true })) === 'Continue',
  )

  it.prop(
    '→Failed∧Exceeded_Decide_=Exhausted',
    [DecideInput],
    ([input]) => tagOf(decideRestart({ ...input, exitSuccess: false, intensityExceeded: true })) === 'Exhausted',
  )

  it.prop(
    '→Failed∧¬Exceeded_Decide_=Restart',
    [DecideInput],
    ([input]) => tagOf(decideRestart({ ...input, exitSuccess: false, intensityExceeded: false })) === 'Restart',
  )

  it.prop(
    '→Restart_Indices_≠∅',
    [DecideInput],
    ([input]) => {
      const indices = indicesOf(decideRestart({ ...input, exitSuccess: false, intensityExceeded: false }))
      return indices !== null && indices.length > 0
    },
  )
})

describe('decideRestart — restart index invariants', () => {
  it.prop(
    '→OneForOne_Indices_={Failed}',
    [DecideInput],
    ([input]) => {
      const indices = indicesOf(
        decideRestart({
          ...input,
          strategy: 'one_for_one',
          exitSuccess: false,
          intensityExceeded: false,
        }),
      )
      return indices !== null && indices.length === 1 && indices[0] === input.failedIndex
    },
  )

  it.prop(
    '→OneForAll_Indices_=All',
    [DecideInput],
    ([input]) => {
      const indices = indicesOf(
        decideRestart({
          ...input,
          strategy: 'one_for_all',
          exitSuccess: false,
          intensityExceeded: false,
        }),
      )
      return indices !== null &&
        indices.length === input.totalChildren &&
        indices[0] === 0 &&
        indices[indices.length - 1] === input.totalChildren - 1
    },
  )

  it.prop(
    '→RestForOne_Indices_=Failed..End',
    [DecideInput],
    ([input]) => {
      const indices = indicesOf(
        decideRestart({
          ...input,
          strategy: 'rest_for_one',
          exitSuccess: false,
          intensityExceeded: false,
        }),
      )
      return indices !== null &&
        indices.length === input.totalChildren - input.failedIndex &&
        indices[0] === input.failedIndex &&
        indices[indices.length - 1] === input.totalChildren - 1
    },
  )

  it.prop(
    '∀s_Indices_⊇Ascending',
    [DecideInput],
    ([input]) => {
      const indices = indicesOf(decideRestart({ ...input, exitSuccess: false, intensityExceeded: false }))
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
