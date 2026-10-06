import type { Duration, Schedule } from 'effect'
import { Schema } from 'effect'

/**
 * How many times a unit may run: a finite positive integer, branded so a bare number cannot stand
 * where a decoded attempt count is required (CONST-D3). The brand carries the invariant the adapter
 * used to guard with `Math.max(0, attempts - 1)`.
 */
export const Attempts = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThan(0)),
  Schema.brand('Attempts'),
)
export type Attempts = typeof Attempts.Type

/**
 * The budget an adapter spends on one unit of work: the attempts it may run, and the schedule the
 * engine waits between them.
 */
export interface RetryBudget<Input = unknown> {
  readonly attempts: Attempts
  readonly schedule: Schedule.Schedule<Duration.Duration | number, Input, never, never>
}
