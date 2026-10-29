import { Schema } from 'effect'

export class InsufficientFundsError
  extends Schema.TaggedError<InsufficientFundsError, { readonly brand: unique symbol }>()(
    'InsufficientFundsError',
    {
      required: Schema.Finite,
      available: Schema.Finite,
    },
  )
{}

export class OutOfStockError
  extends Schema.TaggedError<OutOfStockError, { readonly brand: unique symbol }>()('OutOfStockError', {
    sku: Schema.String,
  })
{}
