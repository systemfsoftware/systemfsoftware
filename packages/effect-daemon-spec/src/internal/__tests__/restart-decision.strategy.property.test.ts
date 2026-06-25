import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Array, Option, Schema } from 'effect'
import { DecideInput, decideRestart, restartIndicesFor, RestartStrategy } from '../restart-decision.strategy.js'

const TotalWithIndex = Schema.Struct({
  total: Schema.Int.pipe(Schema.between(1, 20)),
  failedIndex: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
}).pipe(
  Schema.filter((s) => s.failedIndex < s.total, {
    message: () => 'failedIndex must be < total',
  }),
  Schema.annotations({
    arbitrary: () => (fc) =>
      fc.integer({ min: 1, max: 20 }).chain((total) =>
        fc.integer({ min: 0, max: total - 1 }).map((failedIndex) => ({ total, failedIndex }))
      ),
  }),
)

describe('decideRestart — invariants', () => {
  it.prop(
    '→Succeeded_Exit_=Continue',
    [DecideInput],
    ([input]) => decideRestart({ ...input, exitSuccess: true })._tag === 'Continue',
  )

  it.prop(
    '→Failed∧Exceeded_Decide_=Exhausted',
    [DecideInput],
    ([input]) => decideRestart({ ...input, exitSuccess: false, intensityExceeded: true })._tag === 'Exhausted',
  )

  it.prop(
    '→Failed∧¬Exceeded_Decide_=Restart',
    [DecideInput],
    ([input]) => decideRestart({ ...input, exitSuccess: false, intensityExceeded: false })._tag === 'Restart',
  )

  it.prop(
    '→Restart_Indices_≠∅',
    [DecideInput],
    ([input]) => {
      const d = decideRestart({ ...input, exitSuccess: false, intensityExceeded: false })
      return d._tag === 'Restart' && d.indices.length > 0
    },
  )

  it.prop(
    '→OneForOne_Restart_⊆{Failed}',
    [DecideInput],
    ([input]) => {
      const d = decideRestart({
        ...input,
        strategy: 'one_for_one',
        exitSuccess: false,
        intensityExceeded: false,
      })
      return d._tag === 'Restart' && d.indices.length === 1 && d.indices[0] === input.failedIndex
    },
  )

  it.prop(
    '→OneForAll_Restart_=All',
    [DecideInput],
    ([input]) => {
      const d = decideRestart({
        ...input,
        strategy: 'one_for_all',
        exitSuccess: false,
        intensityExceeded: false,
      })
      return d._tag === 'Restart' && d.indices.length === input.totalChildren
    },
  )

  it.prop(
    '→RestForOne_Restart_⊇Failed..End',
    [DecideInput],
    ([input]) => {
      const d = decideRestart({
        ...input,
        strategy: 'rest_for_one',
        exitSuccess: false,
        intensityExceeded: false,
      })
      return d._tag === 'Restart' &&
        d.indices.length === input.totalChildren - input.failedIndex &&
        d.indices[0] === input.failedIndex
    },
  )
})

describe('restartIndicesFor — structural invariants', () => {
  it.prop(
    '→OneForOne_Return_⊆Failed',
    [TotalWithIndex],
    ([{ total, failedIndex }]) => {
      const out = restartIndicesFor('one_for_one', failedIndex, total)
      return out.length === 1 && out[0] === failedIndex
    },
  )

  it.prop(
    '→OneForAll_Return_=All',
    [TotalWithIndex],
    ([{ total, failedIndex }]) => {
      const out = restartIndicesFor('one_for_all', failedIndex, total)
      return out.length === total && out[0] === 0 && out[total - 1] === total - 1
    },
  )

  it.prop(
    '→RestForOne_Return_⊇Failed..End',
    [TotalWithIndex],
    ([{ total, failedIndex }]) => {
      const out = restartIndicesFor('rest_for_one', failedIndex, total)
      return out.length === total - failedIndex &&
        out[0] === failedIndex &&
        out[out.length - 1] === total - 1
    },
  )

  it.prop(
    '∀s_Indices_⊇Ascending',
    [RestartStrategy, TotalWithIndex],
    ([strategy, { total, failedIndex }]) => {
      const out = restartIndicesFor(strategy, failedIndex, total)
      const strictlyIncreasing = out.length <= 1 ||
        out.every((value, idx) =>
          idx === 0 ||
          Option.match(Array.get(out, idx - 1), {
            onNone: () => false,
            onSome: (prev) => value > prev,
          })
        )
      const withinRange = out.every((idxVal) => idxVal >= 0 && idxVal < total)
      return strictlyIncreasing && withinRange
    },
  )
})
