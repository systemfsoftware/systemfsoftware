import { Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from '../supervisor-dynamic.kernel.js'
import { failedIndexAddressesAChild } from './restart-decision.kernel.js'

export const RestartStrategy = Schema.Literal('one_for_one', 'one_for_all', 'rest_for_one')
export type RestartStrategy = typeof RestartStrategy.Type

export const DecideInput = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.between(1, MAX_CHILDREN_CEILING)),
  failedIndex: Schema.Int.pipe(Schema.between(0, MAX_CHILDREN_CEILING)),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
}).pipe(Schema.filter(failedIndexAddressesAChild, { message: () => 'failedIndex must be < totalChildren' }))
export type DecideInput = typeof DecideInput.Type
