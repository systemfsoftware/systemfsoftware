import { it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const isSmall = (n: number): boolean => n < 100

it.prop(
  '∀n_ShrinkToTheBoundary_=Boundary',
  { of: [Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000 }))], subject: isSmall },
  (subject, [n]) => subject(n),
)
