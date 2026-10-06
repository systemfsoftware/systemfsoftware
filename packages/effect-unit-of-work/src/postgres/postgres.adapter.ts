import type { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import type { RetryBudget } from './retry-budget.schema.js'
import { type PostgresUnitFailure, serializableUnitOfWork } from './unit-of-work.adapter.js'

export const postgres: {
  <D>(
    makeDriver: (sql: SqlClient) => D,
  ): (budget: RetryBudget) => Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient>
  <D>(
    makeDriver: (sql: SqlClient) => D,
    budget: RetryBudget,
  ): Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient>
} = serializableUnitOfWork
