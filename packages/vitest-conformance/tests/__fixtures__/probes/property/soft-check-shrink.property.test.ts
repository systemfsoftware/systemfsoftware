import { expect, it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const below = (n: number): boolean => n < 100

it.prop(
  '∀n_ShrinkToTheBoundary_=Boundary',
  { of: [Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))], subject: below },
  (subject, [n]) => {
    expect.soft(n).toBeLessThan(100)
    return subject(n)
  },
)
