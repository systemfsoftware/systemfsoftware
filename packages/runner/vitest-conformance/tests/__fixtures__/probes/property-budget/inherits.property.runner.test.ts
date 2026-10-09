import { it } from '@systemfsoftware/vitest'
import * as Schema from 'effect/Schema'

const increment = (n: number): number => n + 1

it.prop(
  '∀n_RunTheProvidedBudget_=Configured',
  {
    of: [Schema.Int],
    subject: increment,
    cover: { never: [() => false, 1] },
  },
  (subject, [n]) => subject(n) === n + 1,
)
