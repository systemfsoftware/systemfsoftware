import type { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { type RetryBudget, serializableUnitOfWork } from './unit-of-work.adapter.js'

export type { RetryBudget } from './unit-of-work.adapter.js'

export const postgres: {
  <D>(
    makeDriver: (sql: SqlClient) => D,
  ): (budget: RetryBudget) => Effect.Effect<UnitOfWork.UnitOfWork<D>, never, SqlClient>
  <D>(makeDriver: (sql: SqlClient) => D, budget: RetryBudget): Effect.Effect<UnitOfWork.UnitOfWork<D>, never, SqlClient>
} = serializableUnitOfWork
