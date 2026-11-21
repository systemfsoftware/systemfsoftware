import { it } from '@systemfsoftware/vitest'
import * as Schema from 'effect/Schema'

const identity = (value: number): number => value

it.prop(
  '∀n_AlwaysHolds_=True',
  { of: [Schema.Int], subject: identity, runs: 5 },
  () => true,
)
