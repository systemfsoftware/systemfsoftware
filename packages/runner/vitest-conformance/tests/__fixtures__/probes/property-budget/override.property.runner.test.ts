import { it } from '@systemfsoftware/vitest'
import * as Schema from 'effect/Schema'

const increment = (n: number): number => n + 1
const keepSmall = (n: number): number => Math.min(n, 10)

const SMALLEST_COUNTEREXAMPLE = 10

it.prop(
  '∀n_RunTheExplicitBudget_=Given',
  {
    of: [Schema.Int],
    subject: increment,
    runs: 3,
    cover: { never: [() => false, 1] },
  },
  (subject, [n]) => subject(n) === n + 1,
)

it.prop(
  '∀n_KeepsLargeValues_⊥Small',
  {
    of: [Schema.Int.check(Schema.isBetween({ minimum: SMALLEST_COUNTEREXAMPLE, maximum: Number.MAX_SAFE_INTEGER }))],
    subject: keepSmall,
  },
  (subject, [n]) => subject(n) < SMALLEST_COUNTEREXAMPLE,
)
