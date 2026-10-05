import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  durableObject,
  type DurableObjectStorage,
  type SqlStorage,
  UnitWentAsync,
} from '@systemfsoftware/effect-unit-of-work/durable-object'
import {
  type ClaimDecision,
  concurrentUnitsSerialize,
  Controls,
  crossKeyCommute,
  endedUnitDies,
  failedUnitWritesNothing,
  Granted,
  idempotentRead,
  readAfterWrite,
  Refused,
  type StoreSubject,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { Array as Arr, Cause, Effect, Exit, Match, Option, Predicate, Schema } from 'effect'

const SEAT_CAP = 100

const TABLES = [
  'CREATE TABLE IF NOT EXISTS seat (id INTEGER PRIMARY KEY AUTOINCREMENT, request TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
] as const

type Unavailable = UnitOfWork.StoreUnavailable

type Shape = 'reference' | 'adapter' | 'runPromise'
type Gap = 'none' | 'yield' | 'sleep'

const SHAPES: ReadonlyArray<Shape> = ['reference', 'adapter', 'runPromise']
const GAPS: ReadonlyArray<Gap> = ['none', 'yield', 'sleep']

const shapeOf = (name: string): Shape =>
  Option.getOrElse(Option.fromUndefinedOr(SHAPES.find((shape) => name.startsWith(shape))), () => 'reference')

const gapOf = (name: string): Gap =>
  Option.getOrElse(Option.fromUndefinedOr(GAPS.find((gap) => name.endsWith(gap))), () => 'none')

const gapEffect = (gap: Gap): Effect.Effect<void> =>
  Match.value(gap).pipe(
    Match.when('none', () => Effect.void),
    Match.when('yield', () => Effect.yieldNow),
    Match.when('sleep', () => Effect.sleep('1 millis')),
    Match.exhaustive,
  )

const rowsOf = (sql: SqlStorage, query: string) => sql.exec(query).toArray()

const seatCount = (sql: SqlStorage): number => rowsOf(sql, 'SELECT id FROM seat').length

const readValue = (sql: SqlStorage, key: string): Option.Option<string> =>
  Option.flatMap(
    Arr.head(rowsOf(sql, `SELECT value FROM kv WHERE key = '${key}'`)),
    (row) => Option.filter(Option.fromUndefinedOr(row['value']), Predicate.isString),
  )

const writeValue = (sql: SqlStorage, key: string, value: string): void => {
  sql.exec(
    `INSERT INTO kv (key, value) VALUES ('${key}', '${value}') ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
}

const decideClaim = (sql: SqlStorage, held: number, request: string): ClaimDecision =>
  Match.value(held < SEAT_CAP).pipe(
    Match.when(true, () => {
      sql.exec(`INSERT INTO seat (request) VALUES ('${request}')`)
      return new Granted({})
    }),
    Match.when(false, () => new Refused({})),
    Match.exhaustive,
  )

const claimEffect = (sql: SqlStorage, gap: Gap, request: string): Effect.Effect<ClaimDecision, Unavailable> =>
  Effect.gen(function*() {
    const held = yield* Effect.sync(() => seatCount(sql))
    yield* gapEffect(gap)
    return yield* Effect.sync(() => decideClaim(sql, held, request))
  })

interface ClaimsDriver {
  readonly read: (key: string) => Effect.Effect<Option.Option<string>, Unavailable>
  readonly write: (key: string, value: string) => Effect.Effect<void, Unavailable>
  readonly claim: (request: string) => Effect.Effect<ClaimDecision, Unavailable>
}

const makeClaimsDriver = (sql: SqlStorage, gap: Gap): ClaimsDriver => ({
  read: (key) => Effect.sync(() => readValue(sql, key)),
  write: (key, value) => Effect.sync(() => writeValue(sql, key, value)),
  claim: (request) => claimEffect(sql, gap, request),
})

const claimOverUnit = (
  port: UnitOfWork.UnitOfWork<ClaimsDriver>,
  request: string,
): Promise<Exit.Exit<ClaimDecision, Unavailable>> =>
  Effect.runPromiseExit(port((unit) => UnitOfWork.use(unit, (driver) => driver.claim(request))))

const claimOverTransaction = (
  storage: DurableObjectStorage,
  sql: SqlStorage,
  request: string,
): Promise<Exit.Exit<ClaimDecision, never>> =>
  Promise.resolve(Exit.succeed(storage.transactionSync(() => decideClaim(sql, seatCount(sql), request))))

const subjectOf = (port: UnitOfWork.UnitOfWork<ClaimsDriver>): StoreSubject<ClaimsDriver> => ({
  unitOfWork: port,
  read: (unit, key) => UnitOfWork.use(unit, (driver) => driver.read(key)),
  write: (unit, key, value) => UnitOfWork.use(unit, (driver) => driver.write(key, value)),
})

const decisionTag = (decision: ClaimDecision): string =>
  Match.value(decision).pipe(
    Match.tag('Granted', () => 'Granted'),
    Match.tag('Refused', () => 'Refused'),
    Match.exhaustive,
  )

const wentAsync = (cause: Cause.Cause<Unavailable>): boolean =>
  Option.isSome(Option.filter(Option.fromUndefinedOr(Cause.squash(cause)), Schema.is(UnitWentAsync)))

const decided = (exit: Exit.Exit<ClaimDecision, Unavailable>): Response =>
  Exit.match(exit, {
    onSuccess: (decision) => Response.json({ decision: decisionTag(decision) }),
    onFailure: (cause) => Response.json({ defect: wentAsync(cause) ? UnitWentAsync.name : 'other' }, { status: 500 }),
  })

const reset = (sql: SqlStorage): void => {
  sql.exec('DROP TABLE IF EXISTS seat')
  sql.exec('DROP TABLE IF EXISTS kv')
  for (const table of TABLES) sql.exec(table)
}

const ensureTables = (sql: SqlStorage): void => {
  for (const table of TABLES) sql.exec(table)
}

interface DurableObjectIdLike {
  readonly name?: string | undefined
}

interface DurableObjectStateLike {
  readonly id: DurableObjectIdLike
  readonly storage: DurableObjectStorage
}

interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>
}

interface ClaimsNamespaceLike {
  idFromName(name: string): DurableObjectIdLike
  get(id: DurableObjectIdLike): DurableObjectStubLike
}

interface Env {
  readonly CLAIMS: ClaimsNamespaceLike
}

export class Claims {
  constructor(private readonly state: DurableObjectStateLike) {}

  get sql(): SqlStorage {
    return this.state.storage.sql
  }

  fetch(request: Request): Promise<Response> {
    return Effect.runPromise(this.routeOf(request))
  }

  routeOf(request: Request): Effect.Effect<Response, Unavailable> {
    const pathname = new URL(request.url).pathname
    const name = this.state.id.name ?? 'reference-none'
    ensureTables(this.sql)
    return Match.value(pathname).pipe(
      Match.when('/claim', () => this.claimRoute(shapeOf(name), gapOf(name), request)),
      Match.when('/rows', () => Effect.sync(() => Response.json({ rows: seatCount(this.sql) }))),
      Match.when('/reset', () =>
        Effect.sync(() => {
          reset(this.sql)
          return Response.json({ reset: true })
        })),
      Match.when('/laws', () => this.lawsRoute(gapOf(name))),
      Match.orElse(() => Effect.sync(() => Response.json({ unknown: pathname }, { status: 404 }))),
    )
  }

  claimRoute(shape: Shape, gap: Gap, request: Request): Effect.Effect<Response> {
    const sql = this.sql
    const storage = this.state.storage
    return Effect.gen(function*() {
      const body = yield* Effect.promise(() => request.text())
      const exit = yield* Match.value(shape).pipe(
        Match.when('reference', () => Effect.promise(() => claimOverTransaction(storage, sql, body))),
        Match.when(
          'adapter',
          () =>
            Effect.promise(() =>
              claimOverUnit(durableObject(storage, (driverSql) => makeClaimsDriver(driverSql, gap)), body)
            ),
        ),
        Match.when(
          'runPromise',
          () => Effect.promise(() => claimOverUnit(Controls.doRunPromise(() => makeClaimsDriver(sql, gap)), body)),
        ),
        Match.exhaustive,
      )
      return decided(exit)
    })
  }

  lawsRoute(gap: Gap): Effect.Effect<Response, Unavailable> {
    const subject = subjectOf(durableObject(this.state.storage, (sql) => makeClaimsDriver(sql, gap)))
    return Effect.map(
      Effect.all({
        readAfterWrite: readAfterWrite(subject, 'order/1', 'settled'),
        idempotentRead: idempotentRead(subject, 'order/2', 'settled'),
        crossKeyCommute: crossKeyCommute(subject, ['order/3', 'held'], ['order/4', 'held']),
        failedUnitWritesNothing: failedUnitWritesNothing(subject, 'order/5', 'settled'),
        concurrentUnitsSerialize: concurrentUnitsSerialize(subject, 'order/6', 'first', 'second'),
        endedUnitDies: endedUnitDies(subject),
      }),
      (verdicts) => Response.json(verdicts),
    )
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const name = new URL(request.url).searchParams.get('name') ?? 'reference-none'
    return env.CLAIMS.get(env.CLAIMS.idFromName(name)).fetch(request)
  },
}
