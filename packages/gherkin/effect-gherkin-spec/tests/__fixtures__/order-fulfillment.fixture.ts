import { Schema } from 'effect'

export class InsufficientFundsError extends Schema.TaggedError<InsufficientFundsError>()(
  'InsufficientFundsError',
  {
    required: Schema.Finite,
    available: Schema.Finite,
  },
) {}

export class OutOfStockError extends Schema.TaggedError<OutOfStockError>()('OutOfStockError', {
  sku: Schema.String,
}) {}
