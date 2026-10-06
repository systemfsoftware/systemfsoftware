import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Cause, Duration, Effect, Match, Option, type Schedule } from 'effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import { isSqlError, type SqlError } from 'effect/sql/SqlError'
import { close, mint } from '../UnitOfWork/unit.handle.js'
import { type RerunReason, rerunUnitOnSerialization, UnitAttempt } from './rerun-unit-on-serialization.workflow.js'

export type Isolation = 'SERIALIZABLE' | 'READ COMMITTED'

export interface RetryBudget<Input = unknown> {
  readonly attempts: number
  readonly schedule: Schedule.Schedule<Duration.Duration | number, Input, never, never>
}

export interface SqlUnitOfWork {
  <D>(
    makeDriver: (sql: SqlClient) => D,
  ): (budget: RetryBudget) => Effect.Effect<UnitOfWork.UnitOfWork<D>, never, SqlClient>
  <D>(makeDriver: (sql: SqlClient) => D, budget: RetryBudget): Effect.Effect<UnitOfWork.UnitOfWork<D>, never, SqlClient>
}

const unsettled: RerunReason = 'UnknownError'

const isolationStatement = (sql: SqlClient, isolation: Isolation) =>
  Match.value(isolation).pipe(
    Match.when('SERIALIZABLE', () =>
      Effect.provideService(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`, SqlClient, sql)),
    Match.when('READ COMMITTED', () =>
      Effect.provideService(sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`, SqlClient, sql)),
    Match.exhaustive,
  )

/** The engine's failure inside a unit, and the reason the driver classified it as. */
const reasonOf = <E>(failure: E | SqlError): RerunReason => isSqlError(failure) ? failure.reason._tag : unsettled

const rerunable = <E>(failure: E | SqlError): boolean =>
  Match.value(Result.getOrThrow(rerunUnitOnSerialization(new UnitAttempt({ reason: reasonOf(failure) })))).pipe(
    Match.tag('Rerun', () => true),
    Match.tag('Abandoned', () => false),
    Match.exhaustive,
  )

/**
 * The engine's abort however the transaction reported it. `withTransaction` dies when COMMIT
 * fails, and Postgres raises a serialization failure at COMMIT as often as on a statement, so
 * the same abort arrives as a defect there and as a typed failure here.
 */
const engineAbort = <E>(cause: Cause.Cause<E | SqlError>): Option.Option<SqlError> =>
  Option.orElse(
    Option.filter(Cause.findErrorOption(cause), isSqlError),
    () =>
      Option.filter(
        Result.match(Cause.findDefect(cause), { onSuccess: Option.some, onFailure: () => Option.none() }),
        isSqlError,
      ),
  )

const asTypedFailure = <E>(cause: Cause.Cause<E | SqlError>) =>
  Option.match(engineAbort(cause), {
    onNone: () => Effect.failCause(cause),
    onSome: (failure) => Effect.fail(failure),
  })

const runUnit = <D>(
  sql: SqlClient,
  makeDriver: (sql: SqlClient) => D,
  isolation: Isolation,
  budget: RetryBudget,
): UnitOfWork.UnitOfWork<D> =>
<A, E, R>(
  use: (unit: UnitOfWork.Unit<D>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | UnitOfWork.StoreUnavailable, R> =>
  sql.withTransaction(
    Effect.gen(function*() {
      yield* isolationStatement(sql, isolation)
      const unit = yield* mint(makeDriver(sql))
      return yield* Effect.ensuring(use(unit), close(unit))
    }),
  ).pipe(
    Effect.catchCause(asTypedFailure),
    Effect.retry({
      while: rerunable,
      times: Math.max(0, budget.attempts - 1),
      schedule: budget.schedule,
    }),
    Effect.catchTag('SqlError', (cause) => Effect.fail(new UnitOfWork.StoreUnavailable({ cause }))),
  )

const unitOfWorkAt = (isolation: Isolation): SqlUnitOfWork =>
  dual(
    2,
    <D>(
      makeDriver: (sql: SqlClient) => D,
      budget: RetryBudget,
    ): Effect.Effect<UnitOfWork.UnitOfWork<D>, never, SqlClient> =>
      Effect.map(Effect.service(SqlClient), (sql) => runUnit(sql, makeDriver, isolation, budget)),
  )

export const serializableUnitOfWork: SqlUnitOfWork = unitOfWorkAt('READ COMMITTED')
export const readCommittedUnitOfWork: SqlUnitOfWork = unitOfWorkAt('READ COMMITTED')
