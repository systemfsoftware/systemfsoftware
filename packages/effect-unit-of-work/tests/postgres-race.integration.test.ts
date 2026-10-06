import * as PgClient from '@effect/sql-pg/PgClient'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  type ClaimDecision,
  Controls,
  Granted,
  Held,
  JudgeLaw,
  judgeLaw,
  RACE,
  Race,
  Refused,
  type Verdict,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { postgres, type RetryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Array as Arr, Cause, Duration, Effect, Exit, Layer, Match, Ref, Schedule, Schema } from 'effect'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import { isSqlError, type SqlError } from 'effect/sql/SqlError'
import { throwawayPostgres } from './__fixtures__/postgres-server.fixture.js'

const Feature = makeFeature({ it })

const CLAIMS = 24
const CAP = 20
const GAP_SECONDS = 0.02
const RACE_BUDGET: RetryBudget = {
  attempts: 60,
  schedule: Schedule.jittered(
    Schedule.min([Schedule.exponential(Duration.millis(2)), Schedule.spaced(Duration.millis(50))]),
  ),
}

const raceLayer: Layer.Layer<PgClient.PgClient | SqlClient, never> = Layer
  .unwrap(Effect.map(throwawayPostgres, (url) => PgClient.layer({ url, maxConnections: CLAIMS * 4 })))
  .pipe(Layer.orDie)

interface RaceDriver {
  readonly claim: (request: string) => Effect.Effect<ClaimDecision, SqlError, SqlClient>
  readonly count: Effect.Effect<number, SqlError, SqlClient>
}

const raceDriverOn = (sql: SqlClient): RaceDriver => ({
  claim: (request) =>
    Effect.gen(function*() {
      const rows = yield* sql<{ readonly taken: number }>`SELECT count(*)::int AS taken FROM race_seats`
      const taken = rows[0]?.taken ?? 0
      yield* sql`SELECT pg_sleep(${GAP_SECONDS})`
      if (taken >= CAP) return new Refused({})
      yield* sql`INSERT INTO race_seats (request) VALUES (${request})`
      return new Granted({})
    }),
  count: Effect.map(
    sql<{ readonly taken: number }>`SELECT count(*)::int AS taken FROM race_seats`,
    (rows) => rows[0]?.taken ?? 0,
  ),
})

const prepared: Effect.Effect<void, SqlError, SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS race_seats (request text PRIMARY KEY)`
  yield* sql`TRUNCATE race_seats`
}).pipe(Effect.asVoid)

type RaceFailure = SqlError | UnitOfWork.StoreUnavailable
type RaceExit = Exit.Exit<ClaimDecision, RaceFailure>

const tagOf = <F>(failure: F): string =>
  isSqlError(failure)
    ? failure.reason._tag
    : Schema.is(UnitOfWork.StoreUnavailable)(failure)
    ? 'StoreUnavailable'
    : 'untyped'

const grantedIn = (exit: RaceExit): number =>
  Exit.match(exit, {
    onSuccess: (decision): number =>
      Match.value(decision).pipe(Match.tag('Granted', () => 1), Match.tag('Refused', () => 0), Match.exhaustive),
    onFailure: () => 0,
  })

const decidedIn = (exit: RaceExit): number => Exit.match(exit, { onSuccess: () => 1, onFailure: () => 0 })

const failureNameOf = (exit: RaceExit): string =>
  Exit.match(exit, {
    onSuccess: () => 'decided',
    onFailure: (cause): string => tagOf(Cause.squash(cause)),
  })

interface RaceObserved {
  readonly verdict: Verdict
  readonly granted: number
  readonly decided: number
  readonly rows: number
  readonly tries: ReadonlyArray<number>
  readonly unavailable: ReadonlyArray<string>
}

const raceOf = (
  port: UnitOfWork.UnitOfWork<RaceDriver>,
  claims: number,
): Effect.Effect<RaceObserved, RaceFailure, SqlClient> =>
  Effect.gen(function*() {
    const driver = raceDriverOn(yield* SqlClient)
    const counters = yield* Effect.forEach(Array.from({ length: claims }), () => Ref.make(0))
    const exits = yield* Effect.forEach(
      counters,
      (counter, index) => {
        const counted: UnitOfWork.UnitOfWork<RaceDriver> = (use) =>
          port((unit) => Effect.andThen(Ref.update(counter, (count) => count + 1), use(unit)))
        return Effect.exit(counted(() => driver.claim(`claim-${index}`)))
      },
      { concurrency: 'unbounded' },
    )
    const tries = yield* Effect.forEach(counters, Ref.get)
    const rows = yield* driver.count
    const granted = exits.reduce((total, exit) => total + grantedIn(exit), 0)
    const decided = exits.reduce((total, exit) => total + decidedIn(exit), 0)
    return {
      verdict: Result.getOrThrow(
        judgeLaw(
          new JudgeLaw({
            law: RACE,
            observation: new Race({ requested: claims, cap: CAP, granted, decided, rows }),
          }),
        ),
      ),
      granted,
      decided,
      rows,
      tries,
      unavailable: Arr.dedupe(exits.map((exit) => failureNameOf(exit)).filter((name) => name !== 'decided')),
    }
  })

const reported = (shape: string, observed: RaceObserved): RaceObserved => {
  const attempts = observed.tries.reduce((total, count) => total + count, 0)
  process.stdout.write(
    `uow-race ${shape} claims=${CLAIMS} cap=${CAP} granted=${observed.granted} decided=${observed.decided} ` +
      `rows=${observed.rows} attempts=${attempts} retries=${attempts - CLAIMS} tries=${observed.tries.join(',')} ` +
      `verdict=${observed.verdict._tag} unavailable=${observed.unavailable.join(',') || 'none'}\n`,
  )
  return observed
}

Feature('The race law over a real Postgres server', { timeout: 300_000 })
  .live('a real Postgres 17 server owns the pool and the sockets this race needs')
  .withLayer(raceLayer)
  .body(({ scenario }) => {
    scenario(
      'A full race through the SERIALIZABLE unit fills the cap exactly',
      Gherkin.Do.pipe(
        Given('an empty seat table on the server')('ready', () => prepared),
        When('twenty-four claims race through the SERIALIZABLE unit')(
          'observed',
          () => Effect.flatMap(postgres(raceDriverOn, RACE_BUDGET), (port) => raceOf(port, CLAIMS)),
        ),
        Then('the race law holds with the cap filled exactly')((s, expect) => {
          const observed = reported('adapter', s.observed)
          return expect({ verdict: observed.verdict, granted: observed.granted, rows: observed.rows }).toEqual({
            verdict: Held.make({}),
            granted: CAP,
            rows: CAP,
          })
        }),
      ),
    )

    scenario(
      'The READ COMMITTED control oversells and the race law names it',
      Gherkin.Do.pipe(
        Given('an empty seat table on the server')('ready', () => prepared),
        When('twenty-four claims race through the READ COMMITTED control')(
          'observed',
          () =>
            Effect.flatMap(Controls.postgresReadCommitted(raceDriverOn, RACE_BUDGET), (port) => raceOf(port, CLAIMS)),
        ),
        Then('the law reports Broken over more grants than the cap')((s, expect) => {
          const observed = reported('read-committed', s.observed)
          return expect({ oversold: observed.granted > CAP, verdict: observed.verdict._tag }).toEqual({
            oversold: true,
            verdict: 'Broken',
          })
        }),
      ),
    )
  })
