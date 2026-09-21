import { Context, type Duration } from 'effect'

export interface FulfillmentConfig {
  readonly maxRetries: number
  readonly retryInterval: Duration.Duration
}

export const FulfillmentConfig = Context.Service<FulfillmentConfig>(
  '@systemfsoftware/example-inventory-fulfillment/FulfillmentConfig',
)
