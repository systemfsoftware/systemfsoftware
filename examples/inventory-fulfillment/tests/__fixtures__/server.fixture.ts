import { NodeCrypto, NodeHttpClient } from '@effect/platform-node'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import type { PGlite } from '@electric-sql/pglite'
import {
  auditEvents,
  AuthService,
  type Client,
  DrizzleSession,
  Fulfillment,
  HttpLive,
  httpServerLayer,
  Inventory,
  makeAuth,
  makeRpcClient,
  ReservationLog,
  reservations,
  ReservationView,
  SettlementStore,
  stockLots,
  StockView,
  SubmitOrderRequest,
  user,
  warehouses,
} from '@systemfsoftware/example-inventory-fulfillment'
import type {
  Client as RpcClientHandle,
  DrizzleDatabase,
  SettlementCommand,
  SettlementStoreService,
} from '@systemfsoftware/example-inventory-fulfillment'
import { drizzle } from 'drizzle-orm/pglite'
import { sql } from 'drizzle-orm/sql'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import {
  ConfigProvider,
  Context,
  Crypto,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Ref,
  Result,
  Schema as S,
} from 'effect'
import type * as Scope from 'effect/Scope'
import { Cookies, HttpClient, HttpClientRequest, HttpServer } from 'effect/unstable/http'
import { RpcSerialization } from 'effect/unstable/rpc'

const {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  ConflictRollback,
  CreditHold,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  InsufficientStock,
  Unauthorized,
} = Fulfillment.Decision
type FulfillmentDecision = Fulfillment.Decision.FulfillmentDecision
type FulfillmentError = Fulfillment.Decision.FulfillmentError
const FulfillmentConfig = Fulfillment.FulfillmentConfig
const InventoryStore = Inventory.InventoryStore

const pgTestLayer = Layer.mergeAll(
  InventoryStore.Live,
  SettlementStore.Live,
  ReservationLog.Live,
).pipe(
  Layer.provideMerge(DrizzleSession.Test),
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

export {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  ConflictRollback,
  CreditHold,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  InsufficientStock,
  ReservationView,
  StockView,
  Unauthorized,
}
export type { Client, FulfillmentDecision, FulfillmentError }

let sequence = 0
const nextId = (prefix: string): string => {
  sequence += 1
  return `${prefix}-${process.pid.toString(36)}-${sequence}`
}

export const uniqueId = nextId
export const uniqueEmail = (): string => `${nextId('user')}@example.test`
export const uniquePassword = (): string => `pw-${nextId('secret')}`

type BumpMode = 'off' | 'once' | 'always'
type HoldMode = 'off' | 'hold'

export interface ConflictSeamService {
  readonly armOnce: Effect.Effect<void>
  readonly armAlways: Effect.Effect<void>
  readonly holdOnce: Effect.Effect<void>
  readonly disarm: Effect.Effect<void>
  readonly shouldBump: Effect.Effect<boolean>
  /** Called by instrumented reads: parks once when armed, signalling arrival first. */
  readonly park: Effect.Effect<void>
  /** Completes when a read has parked at the seam. */
  readonly held: Effect.Effect<void>
  readonly release: Effect.Effect<void>
}

export class ConflictSeam extends Context.Service<ConflictSeam, ConflictSeamService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/ConflictSeam',
) {}

const parkLimit = Duration.seconds(10)

const conflictSeamLayer: Layer.Layer<ConflictSeam> = Layer.effect(
  ConflictSeam,
  Effect.gen(function*() {
    const bumps = yield* Ref.make<BumpMode>('off')
    const holds = yield* Ref.make<HoldMode>('off')
    const parked = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    const awaitRelease = Deferred.await(released).pipe(
      Effect.timeoutOrElse({
        duration: parkLimit,
        orElse: () =>
          Effect.die(
            new Error('The conflict seam held a read but no test released it: pair holdOnce with held and release.'),
          ),
      }),
    )
    return {
      armOnce: Ref.set(bumps, 'once'),
      armAlways: Ref.set(bumps, 'always'),
      holdOnce: Ref.set(holds, 'hold'),
      disarm: Effect.andThen(Ref.set(bumps, 'off'), Ref.set(holds, 'off')),
      shouldBump: Ref.modify(bumps, (current): readonly [boolean, BumpMode] =>
        Match.value(current).pipe(
          Match.when('always', () => [true, 'always'] as const),
          Match.when('once', () => [true, 'off'] as const),
          Match.when('off', () => [false, 'off'] as const),
          Match.exhaustive,
        )),
      park: Effect.flatMap(
        Ref.modify(holds, (current): readonly [boolean, HoldMode] =>
          Match.value(current).pipe(
            Match.when('hold', () => [true, 'off'] as const),
            Match.when('off', () => [false, 'off'] as const),
            Match.exhaustive,
          )),
        (hold) => (hold ? Effect.andThen(Deferred.succeed(parked, void 0), awaitRelease) : Effect.void),
      ),
      held: Deferred.await(parked),
      release: Effect.asVoid(Deferred.succeed(released, void 0)),
    }
  }),
)

const bumpStockVersions = (db: DrizzleDatabase): Effect.Effect<void, never> =>
  db.execute(sql`UPDATE stock_lots SET version = version + 1`).pipe(Effect.orDie, Effect.asVoid)

const seamInstrumentedSettlementStore: Layer.Layer<SettlementStore, never, DrizzleSession | ConflictSeam> = pgTestLayer
  .pipe(
    Layer.flatMap((context) => {
      const store = Context.get(context, SettlementStore)
      return Layer.effect(
        SettlementStore,
        Effect.gen(function*() {
          const db = yield* DrizzleSession
          const seam = yield* ConflictSeam
          return {
            readCredit: (customerId: string) =>
              Effect.flatMap(store.readCredit(customerId), (credit) => Effect.as(seam.park, credit)),
            readAllStock: Effect.gen(function*() {
              const stock = yield* store.readAllStock
              const bump = yield* seam.shouldBump
              yield* bump ? bumpStockVersions(db) : Effect.void
              return stock
            }),
            settle: (command: SettlementCommand) => store.settle(command),
          }
        }),
      )
    }),
  )

const wrappedFoundation = seamInstrumentedSettlementStore.pipe(Layer.provideMerge(pgTestLayer))

const authLayer: Layer.Layer<AuthService, never, Pglite.PgliteClient> = Layer.effect(
  AuthService,
  Effect.gen(function*() {
    const raw = yield* Pglite.PgliteClient
    const crypto = yield* Crypto.Crypto
    const uuid1 = yield* crypto.randomUUIDv4
    const uuid2 = yield* crypto.randomUUIDv4
    const promiseDb = drizzle({ client: raw.pglite as PGlite })
    return makeAuth(promiseDb, `${uuid1}${uuid2}`)
  }),
).pipe(Layer.provide(NodeCrypto.layer), Layer.orDie)

export interface Session {
  readonly userId: string
  readonly cookie: string
}

export interface StockLotInput {
  readonly id: string
  readonly sku: string
  readonly warehouseId: string
  readonly quantity: number
  readonly version?: number
  readonly expiresAt?: DateTime.Utc
}

export interface CreditInput {
  readonly userId: string
  readonly tier: 'VIP' | 'Standard'
  readonly creditLimit: number
  readonly outstandingBalance?: number
  readonly overdraftPrivilege?: number
}

export interface ReservationRow {
  readonly orderId: string
  readonly customerId: string
  readonly sku: string
  readonly warehouseId: string
  readonly lotId: string
  readonly quantity: number
}

export interface StockState {
  readonly quantityOnHand: number
  readonly version: number
}

export interface CreditState {
  readonly creditLimit: number
  readonly outstandingBalance: number
  readonly overdraftPrivilege: number
}

export interface SeedService {
  readonly warehouse: (id: string, region: string) => Effect.Effect<void>
  readonly stockLot: (input: StockLotInput) => Effect.Effect<void>
  readonly credit: (input: CreditInput) => Effect.Effect<void>
}

export interface InspectService {
  readonly stock: (lotId: string) => Effect.Effect<StockState>
  readonly credit: (userId: string) => Effect.Effect<CreditState>
  readonly reservations: (orderId: string) => Effect.Effect<readonly ReservationRow[]>
  readonly auditTags: (orderId: string) => Effect.Effect<readonly string[]>
}

export interface TestServerService {
  readonly baseUrl: string
  readonly signUp: (email: string, password: string, name: string) => Effect.Effect<Session>
  readonly signIn: (email: string, password: string) => Effect.Effect<Session>
  readonly client: (cookie?: string) => Effect.Effect<RpcClientHandle, never, Scope.Scope>
  readonly seam: ConflictSeamService
  readonly seed: SeedService
  readonly inspect: InspectService
}

export class TestServer extends Context.Service<TestServer, TestServerService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/TestServer',
) {}

export type SettlementOutcome =
  | { readonly _tag: 'Allocated' }
  | { readonly _tag: 'Backordered' }
  | { readonly _tag: 'Held'; readonly shortfall: number }
  | { readonly _tag: 'Refused' }
  | { readonly _tag: 'Conflicted' }

export interface CellOrderInput {
  readonly orderId: string
  readonly customerId: string
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[]
}

export interface CellHarnessService {
  readonly submit: (input: CellOrderInput) => Effect.Effect<SettlementOutcome>
  readonly seed: SeedService
  readonly inspect: InspectService
}

export class CellHarness extends Context.Service<CellHarness, CellHarnessService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/CellHarness',
) {}

export interface SubmitOrderInput {
  readonly orderId: string
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[]
  readonly kits?: readonly {
    readonly kitSku: string
    readonly components: readonly { readonly sku: string; readonly quantity: number }[]
  }[]
  readonly fraudRisk?: number
}

export const submitRequest = (input: SubmitOrderInput): Effect.Effect<SubmitOrderRequest> =>
  S.decodeEffect(SubmitOrderRequest)({
    orderId: input.orderId,
    lines: input.lines,
    kits: input.kits ?? [],
    fraudRisk: input.fraudRisk ?? 0,
  }).pipe(Effect.orDie)

const cookieHeaderOf = (cookies: Cookies.Cookies): string => {
  const header = Cookies.toCookieHeader(cookies)
  if (header.length === 0) {
    throw new Error('auth: response carried no session cookie')
  }
  return header
}

const userFromSession = <J = unknown>(json: J): string => {
  const session = json as { readonly user?: { readonly id?: string } } | null
  const id = session?.user?.id
  if (typeof id !== 'string') {
    throw new Error('auth: get-session did not return a user')
  }
  return id
}

type BuildContext = HttpServer.HttpServer | HttpClient.HttpClient | DrizzleSession | ConflictSeam

const buildService = (context: Context.Context<BuildContext>): TestServerService => {
  const server = Context.get(context, HttpServer.HttpServer)
  const http = Context.get(context, HttpClient.HttpClient)
  const db = Context.get(context, DrizzleSession)
  const seam = Context.get(context, ConflictSeam)
  const baseUrl = HttpServer.formatAddress(server.address)

  const execute = (request: HttpClientRequest.HttpClientRequest) => http.execute(request).pipe(Effect.orDie)

  const post = <B = unknown>(path: string, body: B) =>
    Effect.gen(function*() {
      const request = HttpClientRequest.post(`${baseUrl}${path}`).pipe(HttpClientRequest.bodyJsonUnsafe(body))
      const response = yield* execute(request)
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.die(new Error(`auth ${path} failed with status ${response.status}`))
      }
      return response
    })

  const resolveUserId = (cookie: string) =>
    Effect.gen(function*() {
      const request = HttpClientRequest.get(`${baseUrl}/api/auth/get-session`).pipe(
        HttpClientRequest.setHeader('cookie', cookie),
      )
      const response = yield* execute(request)
      const json = yield* response.json.pipe(Effect.orDie)
      return userFromSession(json)
    })

  const authenticate = <B = unknown>(path: string, body: B): Effect.Effect<Session> =>
    Effect.gen(function*() {
      const response = yield* post(path, body)
      const cookie = cookieHeaderOf(response.cookies)
      const userId = yield* resolveUserId(cookie)
      return { userId, cookie }
    })

  const client = (cookie?: string): Effect.Effect<RpcClientHandle, never, Scope.Scope> =>
    makeRpcClient({ baseUrl, cookie }).pipe(
      Effect.provide(RpcSerialization.layerJson),
      Effect.provideService(HttpClient.HttpClient, http),
    )

  return {
    baseUrl,
    seam,
    signUp: (email, password, name) => authenticate('/api/auth/sign-up/email', { email, password, name }),
    signIn: (email, password) => authenticate('/api/auth/sign-in/email', { email, password }),
    client,
    seed: seedServiceOf(db),
    inspect: inspectServiceOf(db),
  }
}

const seedServiceOf = (db: DrizzleDatabase): SeedService => ({
  warehouse: (id, region) => db.insert(warehouses).values({ id, region }).pipe(Effect.orDie, Effect.asVoid),
  stockLot: (input) =>
    db.insert(stockLots).values({
      id: input.id,
      sku: input.sku,
      warehouseId: input.warehouseId,
      quantityOnHand: input.quantity,
      version: input.version ?? 1,
      expiresAt: input.expiresAt === undefined ? null : DateTime.toDate(input.expiresAt),
    }).pipe(Effect.orDie, Effect.asVoid),
  credit: (input) =>
    db.update(user).set({
      tier: input.tier,
      creditLimit: input.creditLimit,
      outstandingBalance: input.outstandingBalance ?? 0,
      overdraftPrivilege: input.overdraftPrivilege ?? 0,
    }).where(eq(user.id, input.userId)).pipe(Effect.orDie, Effect.asVoid),
})

const inspectServiceOf = (db: DrizzleDatabase): InspectService => ({
  stock: (lotId) =>
    Effect.gen(function*() {
      const rows = yield* db.select().from(stockLots).where(eq(stockLots.id, lotId)).pipe(Effect.orDie)
      return yield* Option.match(Option.fromUndefinedOr(rows[0]), {
        onNone: () => Effect.die(new Error(`inspect: no stock lot ${lotId}`)),
        onSome: (row) => Effect.succeed({ quantityOnHand: row.quantityOnHand, version: row.version }),
      })
    }),
  credit: (userId) =>
    Effect.gen(function*() {
      const rows = yield* db.select().from(user).where(eq(user.id, userId)).pipe(Effect.orDie)
      return yield* Option.match(Option.fromUndefinedOr(rows[0]), {
        onNone: () => Effect.die(new Error(`inspect: no credit account ${userId}`)),
        onSome: (row) =>
          Effect.succeed({
            creditLimit: row.creditLimit,
            outstandingBalance: row.outstandingBalance,
            overdraftPrivilege: row.overdraftPrivilege,
          }),
      })
    }),
  reservations: (orderId) =>
    Effect.map(
      db.select().from(reservations).where(eq(reservations.orderId, orderId)).pipe(Effect.orDie),
      (rows) =>
        rows.map((row) => ({
          orderId: row.orderId,
          customerId: row.customerId,
          sku: row.sku,
          warehouseId: row.warehouseId,
          lotId: row.lotId,
          quantity: row.quantity,
        })),
    ),
  auditTags: (orderId) =>
    Effect.map(
      db.select().from(auditEvents).where(eq(auditEvents.orderId, orderId)).pipe(Effect.orDie),
      (rows) => rows.map((row) => row.decisionTag),
    ),
})

type SettlementDecision = Fulfillment.Decision.CoreFulfillmentDecision | Fulfillment.Decision.FulfillmentRefusal
type SettlementFailure = Fulfillment.Decision.OptimisticConflict | Fulfillment.Decision.CreditAccountNotFound

const conflicted: SettlementOutcome = { _tag: 'Conflicted' }

const outcomeOf = (attempt: Result.Result<SettlementDecision, SettlementFailure>): Effect.Effect<SettlementOutcome> =>
  Result.match(attempt, {
    onFailure: (failure) =>
      Match.value(failure).pipe(
        Match.tag('OptimisticConflict', (): Effect.Effect<SettlementOutcome> => Effect.succeed(conflicted)),
        Match.orElse((error) => Effect.die(error)),
      ),
    onSuccess: (decision) =>
      Effect.succeed(
        Match.value(decision).pipe(
          Match.tag('AllocatedSplit', 'AllocatedWithOverdraft', (): SettlementOutcome => ({ _tag: 'Allocated' })),
          Match.tag('Backordered', (): SettlementOutcome => ({ _tag: 'Backordered' })),
          Match.tag('CreditHold', (held): SettlementOutcome => ({ _tag: 'Held', shortfall: held.shortfall })),
          Match.tag('InsufficientStock', 'CreditLimitExceeded', (): SettlementOutcome => ({ _tag: 'Refused' })),
          Match.exhaustive,
        ),
      ),
  })

const buildCellHarness = (
  store: SettlementStoreService,
  db: DrizzleDatabase,
): CellHarnessService => {
  const attempt = (input: CellOrderInput): Effect.Effect<SettlementOutcome> =>
    Effect.gen(function*() {
      const order = yield* S.decodeEffect(Fulfillment.Order.Order)({
        orderId: input.orderId,
        customerId: input.customerId,
        lines: input.lines,
      }).pipe(Effect.orDie)
      const fraudRisk = yield* S.decodeEffect(Fulfillment.Credit.FraudRiskScore)(0).pipe(Effect.orDie)
      return yield* Fulfillment.fulfillmentCell.run({ order, kits: [], fraudRisk })
    }).pipe(
      Effect.provideService(SettlementStore, store),
      Effect.result,
      Effect.flatMap(outcomeOf),
    )
  return {
    submit: attempt,
    seed: seedServiceOf(db),
    inspect: inspectServiceOf(db),
  }
}

const ephemeralPortConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ PORT: '0' }),
)

const fulfillmentConfigLayer = Layer.succeed(FulfillmentConfig, {
  maxRetries: 3,
  retryInterval: Duration.millis(10),
})

const appLayer = HttpLive.pipe(
  Layer.provide(authLayer),
  Layer.provideMerge(wrappedFoundation),
  Layer.provideMerge(conflictSeamLayer),
  Layer.provideMerge(fulfillmentConfigLayer),
  Layer.provide(ephemeralPortConfigLayer),
)

const fullLayer = Layer.mergeAll(
  appLayer,
  httpServerLayer.pipe(Layer.provide(ephemeralPortConfigLayer)),
  NodeHttpClient.layerUndici,
).pipe(Layer.orDie)

export const TestServerLayer: Layer.Layer<TestServer | CellHarness> = fullLayer.pipe(
  Layer.flatMap((context) =>
    Layer.mergeAll(
      Layer.succeed(TestServer, buildService(context)),
      Layer.succeed(
        CellHarness,
        buildCellHarness(Context.get(context, SettlementStore), Context.get(context, DrizzleSession)),
      ),
    )
  ),
)
