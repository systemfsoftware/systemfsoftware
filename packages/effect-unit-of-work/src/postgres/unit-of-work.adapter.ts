import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Cause, Context, Effect, Match, Option } from 'effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import { isSqlError, type SqlError } from 'effect/sql/SqlError'
import { close, mint } from '../UnitOfWork/unit.handle.js'
import { type RerunReason, rerunUnitOnSerialization, UnitAttempt } from './rerun-unit-on-serialization.workflow.js'
import type { RetryBudget } from './retry-budget.schema.js'
import { SerializationBudgetExhausted } from './SerializationBudgetExhausted.schema.js'
import { UnitInsideTransaction } from './UnitInsideTransaction.schema.js'

export type Isolation = 'SERIALIZABLE' | 'READ COMMITTED'

/**
 * Everything a Postgres unit can fail with: a store that could not complete the unit, the retry
 * budget spent on a re-runnable engine abort, or a unit opened inside a transaction the caller
 * already had open. The port's error channel is this union, so a caller matches the tag.
 */
export type PostgresUnitFailure =
  | UnitOfWork.StoreUnavailable
  | SerializationBudgetExhausted
  | UnitInsideTransaction

export interface SqlUnitOfWork {
  <D>(
    makeDriver: (sql: SqlClient) => D,
  ): (budget: RetryBudget) => Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient>
  <D>(
    makeDriver: (sql: SqlClient) => D,
    budget: RetryBudget,
  ): Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient>
}

const unsettled: RerunReason = 'UnknownError'

const isolationStatement = (sql: SqlClient, isolation: Isolation) =>
  Match.value(isolation).pipe(
    Match.when('SERIALIZABLE', () => sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`),
    Match.when('READ COMMITTED', () => sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`),
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

/**
 * The retry loop ended on an engine failure. A re-runnable abort that spent the whole budget names
 * itself {@link SerializationBudgetExhausted} with the runs it spent — what distinguishes it from a
 * single `40001` — and any other engine failure is the store being unavailable.
 */
const budgetSpent = <F>(attempts: number, failure: F | SqlError): Effect.Effect<never, PostgresUnitFailure> =>
  rerunable(failure)
    ? Effect.fail(new SerializationBudgetExhausted({ attempts, lastCause: failure }))
    : Effect.fail(new UnitOfWork.StoreUnavailable({ cause: failure }))

const runTransaction = <D>(
  sql: SqlClient,
  makeDriver: (sql: SqlClient) => D,
  isolation: Isolation,
  budget: RetryBudget,
): UnitOfWork.UnitOfWork<D, PostgresUnitFailure> =>
<A, E, R>(
  use: (unit: UnitOfWork.Unit<D>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | PostgresUnitFailure, R> =>
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
      times: budget.attempts - 1,
      schedule: budget.schedule,
    }),
    Effect.catchTag('SqlError', (failure) => budgetSpent(budget.attempts, failure)),
  )

/**
 * The adapter refuses a unit opened inside a transaction the caller already has open on the same
 * client: on the same key the driver would only open a savepoint, and a savepoint is not the
 * SERIALIZABLE transaction a Postgres unit promises.
 */
const runUnit = <D>(
  sql: SqlClient,
  makeDriver: (sql: SqlClient) => D,
  isolation: Isolation,
  budget: RetryBudget,
): UnitOfWork.UnitOfWork<D, PostgresUnitFailure> =>
<A, E, R>(
  use: (unit: UnitOfWork.Unit<D>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | PostgresUnitFailure, R> =>
  Effect.flatMap(
    Effect.context<R>(),
    (context) =>
      Option.match(Context.getOption(context, sql.transactionService), {
        onNone: () => runTransaction(sql, makeDriver, isolation, budget)(use),
        onSome: () => Effect.fail(new UnitInsideTransaction({})),
      }),
  )

const unitOfWorkAt = (isolation: Isolation): SqlUnitOfWork =>
  dual(
    2,
    <D>(
      makeDriver: (sql: SqlClient) => D,
      budget: RetryBudget,
    ): Effect.Effect<UnitOfWork.UnitOfWork<D, PostgresUnitFailure>, never, SqlClient> =>
      Effect.map(Effect.service(SqlClient), (sql) => runUnit(sql, makeDriver, isolation, budget)),
  )

export const serializableUnitOfWork: SqlUnitOfWork = unitOfWorkAt('SERIALIZABLE')
export const readCommittedUnitOfWork: SqlUnitOfWork = unitOfWorkAt('READ COMMITTED')
