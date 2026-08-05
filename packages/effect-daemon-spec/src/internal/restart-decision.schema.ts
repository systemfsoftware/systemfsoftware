import { Schema } from 'effect'
import { DEFAULT_MAX_CHILDREN } from '../supervisor-dynamic.kernel.js'

export const RestartStrategy = Schema.Literal('one_for_one', 'one_for_all', 'rest_for_one')
export type RestartStrategy = typeof RestartStrategy.Type

export const DecideInput = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.between(1, DEFAULT_MAX_CHILDREN)),
  failedIndex: Schema.Int.pipe(Schema.between(0, DEFAULT_MAX_CHILDREN)),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
}).pipe(
  Schema.filter((s) => s.failedIndex < s.totalChildren, {
    message: () => 'failedIndex must be < totalChildren',
  }),
)
export type DecideInput = typeof DecideInput.Type
