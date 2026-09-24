import { it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const length = (xs: ReadonlyArray<number>): number => xs.length

it.prop(
  'Should_NameTheCoverageShare_When_AClassIsBelowItsMinimum',
  {
    of: [Schema.Array(Schema.Int)],
    subject: length,
    runs: 400,
    cover: { singletons: [(values: ReadonlyArray<number>) => values.length === 1, 0.9] },
  },
  (subject, [xs]) => subject(xs) === xs.length,
)
