import { Schema } from 'effect'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import { IncompleteObservationError } from './IncompleteObservationError.schema.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'
import { TransportObservationError } from './TransportObservationError.schema.js'

export const HarnessFailure = Schema.Union([
  ContractDecodeError,
  EmptyObservationError,
  IncompleteObservationError,
  TransportObservationError,
  TraceDisparityError,
])
export type HarnessFailure = typeof HarnessFailure.Type
