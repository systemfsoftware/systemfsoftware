import { it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const increment = (n: number): number => n + 1

it.prop(
  'Should_RunTheProvidedBudget_When_RunsIsOmitted',
  {
    of: [Schema.Int],
    subject: increment,
    cover: { never: [() => false, 1] },
  },
  (subject, [n]) => subject(n) === n + 1,
)
