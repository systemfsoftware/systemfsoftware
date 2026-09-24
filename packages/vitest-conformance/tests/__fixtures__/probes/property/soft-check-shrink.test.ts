import { expect, it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const below = (n: number): boolean => n < 100

it.prop(
  'Should_ShrinkToTheBoundary_When_ASoftCheckFailsFirst',
  { of: [Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))], subject: below },
  (subject, [n]) => {
    expect(n).toBeLessThan(100)
    return subject(n)
  },
)
