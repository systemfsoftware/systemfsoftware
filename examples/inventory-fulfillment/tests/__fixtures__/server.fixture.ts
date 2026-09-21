import { NodeCrypto, NodeHttpClient } from '@effect/platform-node'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import type { PGlite } from '@electric-sql/pglite'
import {
  auditEvents,
  AuthService,
  type Client,
  CreditLedger,
  CustomerGate,
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
  stockLots,
  StockView,
  SubmitOrderRequest,
  user,
  warehouses,
} from '@systemfsoftware/example-inventory-fulfillment'
import type { Client as RpcClientHandle } from '@systemfsoftware/example-inventory-fulfillment'
import type { DrizzleDatabase } from '@systemfsoftware/example-inventory-fulfillment'
import { drizzle } from 'drizzle-orm/pglite'
import { sql } from 'drizzle-orm/sql'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import {
  ConfigProvider,
  Context,
  Crypto,
  DateTime,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Ref,
  Schema as S,
} from 'effect'
import type * as Scope from 'effect/Scope'
import { Cookies, HttpClient, HttpClientRequest, HttpServer } from 'effect/unstable/http'

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
  CreditLedger.Live,
  ReservationLog.Live,
  CustomerGate.Live,
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

type SeamMode = 'off' | 'once' | 'always'

export interface ConflictSeamService {
  readonly armOnce: Effect.Effect<void>
  readonly armAlways: Effect.Effect<void>
  readonly disarm: Effect.Effect<void>
  readonly shouldBump: Effect.Effect<boolean>
}

export class ConflictSeam extends Context.Service<ConflictSeam, ConflictSeamService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/ConflictSeam',
) {}

const conflictSeamLayer: Layer.Layer<ConflictSeam> = Layer.effect(
  ConflictSeam,
  Effect.gen(function*() {
    const mode = yield* Ref.make<SeamMode>('off')
    return {
      armOnce: Ref.set(mode, 'once'),
      armAlways: Ref.set(mode, 'always'),
      disarm: Ref.set(mode, 'off'),
      shouldBump: Ref.modify(mode, (current): readonly [boolean, SeamMode] =>
        Match.value(current).pipe(
          Match.when('always', () => [true, 'always'] as const),
          Match.when('once', () => [true, 'off'] as const),
          Match.when('off', () => [false, 'off'] as const),
          Match.exhaustive,
        )),
    }
  }),
)

const bumpStockVersions = (db: DrizzleDatabase): Effect.Effect<void, never> =>
  db.execute(sql`UPDATE stock_lots SET version = version + 1`).pipe(Effect.orDie, Effect.asVoid)

const seamInstrumentedInventoryStore: Layer.Layer<Inventory.InventoryStore, never, DrizzleSession | ConflictSeam> =
  pgTestLayer
    .pipe(
      Layer.flatMap((context) => {
        const inner = Context.get(context, InventoryStore)
        return Layer.effect(
          InventoryStore,
          Effect.gen(function*() {
            const db = yield* DrizzleSession
            const seam = yield* ConflictSeam
            return {
              readAllStock: Effect.gen(function*() {
                const partitions = yield* inner.readAllStock
                const bump = yield* seam.shouldBump
                yield* bump ? bumpStockVersions(db) : Effect.void
                return partitions
              }),
              readStock: (skus) => inner.readStock(skus),
              readStockPage: (query) => inner.readStockPage(query),
            }
          }),
        )
      }),
    )

const wrappedFoundation = seamInstrumentedInventoryStore.pipe(Layer.provideMerge(pgTestLayer))

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

export interface SeedService {
  readonly warehouse: (id: string, region: string) => Effect.Effect<void>
  readonly stockLot: (input: StockLotInput) => Effect.Effect<void>
  readonly credit: (input: CreditInput) => Effect.Effect<void>
}

export interface InspectService {
  readonly stock: (lotId: string) => Effect.Effect<StockState>
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

const userFromSession = (json: unknown): string => {
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

  const post = (path: string, body: unknown) =>
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

  const authenticate = (path: string, body: unknown): Effect.Effect<Session> =>
    Effect.gen(function*() {
      const response = yield* post(path, body)
      const cookie = cookieHeaderOf(response.cookies)
      const userId = yield* resolveUserId(cookie)
      return { userId, cookie }
    })

  const client = (cookie?: string): Effect.Effect<RpcClientHandle, never, Scope.Scope> =>
    makeRpcClient({ baseUrl, cookie }).pipe(Effect.provideService(HttpClient.HttpClient, http))

  const stockRow = (lotId: string) =>
    Effect.gen(function*() {
      const rows = yield* db.select().from(stockLots).where(eq(stockLots.id, lotId)).pipe(Effect.orDie)
      const found = Option.fromUndefinedOr(rows[0])
      return yield* Option.match(found, {
        onNone: () => Effect.die(new Error(`inspect: no stock lot ${lotId}`)),
        onSome: (row) => Effect.succeed(row),
      })
    })

  return {
    baseUrl,
    seam,
    signUp: (email, password, name) => authenticate('/api/auth/sign-up/email', { email, password, name }),
    signIn: (email, password) => authenticate('/api/auth/sign-in/email', { email, password }),
    client,
    seed: {
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
    },
    inspect: {
      stock: (lotId) =>
        Effect.map(stockRow(lotId), (row) => ({ quantityOnHand: row.quantityOnHand, version: row.version })),
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
    },
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

export const TestServerLayer: Layer.Layer<TestServer> = fullLayer.pipe(
  Layer.flatMap((context) => Layer.succeed(TestServer, buildService(context))),
)
