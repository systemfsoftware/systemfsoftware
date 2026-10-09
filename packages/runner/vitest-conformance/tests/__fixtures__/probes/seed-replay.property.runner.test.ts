import { it } from '@systemfsoftware/vitest'
import * as Schema from 'effect/Schema'

it.prop(
  '∀n_ShiftedByOne_≠n',
  { of: [Schema.Int], subject: (n: number) => n + 1 },
  (subject, [n]) => subject(n) === n,
)
