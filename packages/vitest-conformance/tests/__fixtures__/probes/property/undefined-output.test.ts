import { it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const coldAtZero = (x: number): number | undefined => x === 0 ? undefined : 2

it.prop(
  'a subject whose first output is undefined',
  { of: [Schema.Literal(0)], subject: coldAtZero, runs: 100 },
  (subject, [x]) => (subject(x) === undefined || subject(x) === 2) && subject(1) === 2,
)
