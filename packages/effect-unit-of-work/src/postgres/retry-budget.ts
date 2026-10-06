import { Effect, Schema } from 'effect'
import { dual } from 'effect/Function'
import type { SchemaError } from 'effect/Schema'
import { Attempts, type RetryBudget } from './retry-budget.schema.js'

/**
 * A retry budget. The attempts are decoded here (CONST-B5), so a value that is not a finite positive
 * integer — `0`, `-1`, `1.5`, `NaN`, `Infinity` — is refused with a typed `SchemaError` instead of
 * reaching the engine, and a plain `{ attempts: number }` no longer stands where an adapter takes a
 * budget.
 */
const retryBudgetOver = (
  attempts: number,
  schedule: RetryBudget['schedule'],
): Effect.Effect<RetryBudget, SchemaError> =>
  Effect.map(Schema.decodeEffect(Attempts)(attempts), (decoded) => ({ attempts: decoded, schedule }))

export const retryBudget: {
  (attempts: number, schedule: RetryBudget['schedule']): Effect.Effect<RetryBudget, SchemaError>
  (schedule: RetryBudget['schedule']): (attempts: number) => Effect.Effect<RetryBudget, SchemaError>
} = dual(2, retryBudgetOver)
