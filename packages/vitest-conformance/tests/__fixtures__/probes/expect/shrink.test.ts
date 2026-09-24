import { it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const isSmall = (n: number): boolean => n < 100

it.prop(
  'Should_ShrinkToTheBoundary_When_AWideInputFails',
  { of: [Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000 }))], subject: isSmall, runs: 100 },
  (subject, [n]) => subject(n),
)
