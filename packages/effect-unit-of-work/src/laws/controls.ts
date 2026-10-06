import type { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import type { PostgresUnitFailure, RetryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Effect, Exit } from 'effect'
import type { SqlClient } from 'effect/sql/SqlClient'
import { readCommittedUnitOfWork } from '../postgres/unit-of-work.adapter.js'
import { close, mint } from '../UnitOfWork/unit.handle.js'

/** Must fail the race law (R72f): the Durable Object unit run as `Effect.runPromise`, with no transaction. */
export const doRunPromise = <D>(makeDriver: () => D): UnitOfWork.UnitOfWork<D> =>
<A, E, R>(
  use: (unit: UnitOfWork.Unit<D>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | UnitOfWork.StoreUnavailable, R> =>
  Effect.flatMap(Effect.context<R>(), (context) =>
    Effect.suspend(() => {
      const unit = Effect.runSync(mint(makeDriver()))
      return Effect.flatMap(
        Effect.promise(() =>
          Effect.runPromiseExit(Effect.provideContext(Effect.ensuring(use(unit), close(unit)), context))
        ),
        (exit) =>
          Exit.match(exit, {
            onSuccess: (value): Effect.Effect<A, E> => Effect.succeed(value),
            onFailure: (cause) => Effect.failCause(cause),
          }),
      )
    }))

/** Must fail the race law (R72f): the same unit at READ COMMITTED, where two readers both see the last seat. */
export const postgresReadCommitted: {
  <D>(
    makeDriver: (sql: SqlClient) => D,
  ): (budget: RetryBudget) => Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient>
  <D>(
    makeDriver: (sql: SqlClient) => D,
    budget: RetryBudget,
  ): Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient>
} = readCommittedUnitOfWork
