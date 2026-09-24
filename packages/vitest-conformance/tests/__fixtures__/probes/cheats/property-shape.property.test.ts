import { it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

const subject = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs].sort((a, b) => a - b)
const buggy = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...new Set(xs)].sort((a, b) => a - b)
const oracle = (xs: ReadonlyArray<number>): ReadonlyArray<number> => {
  const out: Array<number> = []
  for (const x of xs) {
    const at = out.findIndex((y) => y > x)
    if (at === -1) out.push(x)
    else out.splice(at, 0, x)
  }
  return out
}
const isSorted = (xs: ReadonlyArray<number>): boolean => xs.every((x, i) => i === 0 || (xs[i - 1] ?? x) <= x)

it.prop(
  '∀xs_KeepsEveryElement_⊆Input',
  { of: [Schema.Array(Schema.Int)], subject },
  (s, [xs]) => isSorted(s(xs)),
)

it.prop(
  '∀xs_BuggySortIsStable_⊆Input',
  { of: [Schema.Array(Schema.Int)], subject: buggy },
  (s, [xs]) => isSorted(s(xs)),
)

it.law.model('sort agrees with insertion sort', { of: [Schema.Array(Schema.Int)], subject }, oracle)

it.law.idempotent('sorting twice changes nothing', { of: [Schema.Array(Schema.Int)], subject, runs: 50 })

it.prop(
  '∀xs_InvalidBudget_⊥Accepted',
  {
    of: [Schema.Array(Schema.Int)],
    subject,
    // @ts-expect-error the run time, not the compiler, is what must refuse a non-positive `runs`
    runs: 0,
  },
  (s, [xs]) => isSorted(s(xs)),
)

it.prop('∀xs_NonBooleanVerdict_⊥Accepted', { of: [Schema.Array(Schema.Int)], subject, runs: 10 }, (s, [xs]) =>
  // @ts-expect-error the run time, not the compiler, is what must refuse an Effect verdict on the sync lane
  Effect.succeed(isSorted(s(xs))))

it.prop(
  '∀xs_SingletonCoverage_⊇Minimum',
  {
    of: [Schema.Array(Schema.Int)],
    subject,
    cover: { singletons: [(values: ReadonlyArray<number>) => values.length === 1, 0.9] },
  },
  (s, [xs]) => isSorted(s(xs)),
)
