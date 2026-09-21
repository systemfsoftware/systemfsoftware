import { Context, type Effect } from 'effect'

/**
 * Per-customer mutual exclusion. `withGate` runs the supplied effect while
 * holding the customer's exclusive permit, so a read-modify-write of that
 * customer's state — the credit check's read, decision and charge — cannot
 * interleave with a sibling order from the same customer.
 *
 * The lock is keyed by `customerId`; different customers never block each
 * other. The in-memory layer is process-local; a deployment with more than one
 * process must back this with a shared lock (a Postgres advisory lock keyed by
 * `customerId`), since two processes share no semaphore.
 */
export interface CustomerGateService {
  readonly withGate: <A, E, R>(
    customerId: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>
}

export class CustomerGate extends Context.Service<CustomerGate, CustomerGateService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/CustomerGate',
) {}
