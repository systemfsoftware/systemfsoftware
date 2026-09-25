import { NodeCrypto, NodeHttpClient } from '@effect/platform-node'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import type { PGlite } from '@electric-sql/pglite'
import {
  Auth,
  Fulfillment,
  Http,
  Inventory,
  Persistence,
  Reservation,
  Rpc,
  Settlement,
} from '@systemfsoftware/example-inventory-fulfillment'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { ConfigProvider, Context, Crypto, DateTime, Deferred, Effect, Layer, Option, Schema as S } from 'effect'
import type * as Scope from 'effect/Scope'
import { Cookies, HttpClient, HttpClientRequest, HttpServer } from 'effect/unstable/http'
import { Rpc as RpcWire, RpcSerialization } from 'effect/unstable/rpc'
import {
  armSeamAlways,
  armSeamOnce,
  disarmSeam,
  exhaustedBudget,
  serializationSeamLayer,
} from './settlement-store.fixture.js'

const {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  CreditHold,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  InsufficientStock,
  StoreUnavailable,
  Unauthorized,
} = Fulfillment.Decision
const AuthService = Auth.Service.AuthService
type AuthService = Auth.Service.AuthService
const DrizzleSession = Persistence.DrizzleSession.DrizzleSession
type DrizzleSession = Persistence.DrizzleSession.DrizzleSession
const makeRpcClient = Rpc.Client.make
const HttpLive = Http.Server.HttpLive
const supervisedApplication = Http.Server.supervisedApplication
const makeAuthService = Auth.Live.makeAuthService
const auditEvents = Persistence.Tables.auditEvents
const reservations = Persistence.Tables.reservations
const stockLots = Persistence.Tables.stockLots
const user = Persistence.Tables.user
const warehouses = Persistence.Tables.warehouses
const ReservationView = Rpc.Schema.ReservationView
type ReservationView = Rpc.Schema.ReservationView
const StockView = Rpc.Schema.StockView
type StockView = Rpc.Schema.StockView
const SubmitOrderRequest = Rpc.Schema.SubmitOrderRequest
type SubmitOrderRequest = Rpc.Schema.SubmitOrderRequest

const ListStock = Rpc.Rpcs.ListStock

const RpcExitResponse = S.Struct({
  _tag: S.tag('Exit'),
  requestId: S.Union([S.String, S.Finite]),
  exit: S.toEncoded(S.toCodecIso(RpcWire.exitSchema(ListStock))),
})
type RpcExitResponse = S.Schema.Type<typeof RpcExitResponse>

type Client = Rpc.Client.Client
type DrizzleDatabase = Persistence.DrizzleSession.DrizzleDatabase
type FulfillmentDecision = Fulfillment.Decision.FulfillmentDecision
type FulfillmentError = Fulfillment.Decision.FulfillmentError

const pgTestLayer = Layer.mergeAll(
  Inventory.Drizzle.layer,
  Settlement.Drizzle.layer(exhaustedBudget),
  Reservation.Drizzle.layer,
).pipe(
  Layer.provideMerge(Persistence.DrizzleSession.layerTest),
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

const wrappedFoundation = pgTestLayer.pipe(
  Layer.provideMerge(serializationSeamLayer.pipe(Layer.provide(pgTestLayer))),
)

const authLayer: Layer.Layer<AuthService, never, Pglite.PgliteClient> = Layer.effect(
  AuthService,
  Effect.gen(function*() {
    const raw = yield* Pglite.PgliteClient
    const crypto = yield* Crypto.Crypto
    const uuid1 = yield* crypto.randomUUIDv4
    const uuid2 = yield* crypto.randomUUIDv4
    const promiseDb = drizzle({ client: raw.pglite as PGlite })
    return makeAuthService(promiseDb, `${uuid1}${uuid2}`)
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

export interface SerializationSeamService {
  readonly armOnce: Effect.Effect<void>
  readonly armAlways: Effect.Effect<void>
  readonly disarm: Effect.Effect<void>
}

const seamServiceOf = (db: DrizzleDatabase): SerializationSeamService => ({
  armOnce: Effect.provideService(armSeamOnce, DrizzleSession, db),
  armAlways: Effect.provideService(armSeamAlways, DrizzleSession, db),
  disarm: Effect.provideService(disarmSeam, DrizzleSession, db),
})

export interface TestServerService {
  readonly baseUrl: string
  readonly signUp: (email: string, password: string, name: string) => Effect.Effect<Session>
  readonly signIn: (email: string, password: string) => Effect.Effect<Session>
  readonly client: (cookie?: string) => Effect.Effect<Client, never, Scope.Scope>
  readonly postRpc: (
    tag: string,
    payload: Record<string, string | number>,
    cookie?: string,
  ) => Effect.Effect<readonly RpcExitResponse[]>
  readonly seam: SerializationSeamService
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

export {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  CreditHold,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  InsufficientStock,
  ReservationView,
  StockView,
  StoreUnavailable,
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

type BuildContext = HttpClient.HttpClient | DrizzleSession

const buildService = (context: Context.Context<BuildContext>, baseUrl: string): TestServerService => {
  const http = Context.get(context, HttpClient.HttpClient)
  const db = Context.get(context, DrizzleSession)

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

  const client = (cookie?: string): Effect.Effect<Client, never, Scope.Scope> =>
    makeRpcClient({ baseUrl, cookie }).pipe(
      Effect.provide(RpcSerialization.layerJson),
      Effect.provideService(HttpClient.HttpClient, http),
    )

  const postRpc = (
    tag: string,
    payload: Record<string, string | number>,
    cookie?: string,
  ): Effect.Effect<readonly RpcExitResponse[]> =>
    Effect.gen(function*() {
      const request = HttpClientRequest.post(`${baseUrl}/rpc`).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          _tag: 'Request',
          id: 'raw-wire-request',
          tag,
          payload,
          headers: [] as const,
        }),
      )
      const response = yield* execute(
        cookie === undefined ? request : HttpClientRequest.setHeader(request, 'cookie', cookie),
      )
      const json = yield* response.json.pipe(Effect.orDie)
      return yield* S.decodeUnknownEffect(S.Array(RpcExitResponse))(json).pipe(Effect.orDie)
    })

  return {
    baseUrl,
    signUp: (email, password, name) => authenticate('/api/auth/sign-up/email', { email, password, name }),
    signIn: (email, password) => authenticate('/api/auth/sign-in/email', { email, password }),
    client,
    postRpc,
    seam: seamServiceOf(db),
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

const ephemeralPortConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ PORT: '0' }),
)

const rootLayer = Layer.mergeAll(
  authLayer.pipe(Layer.provideMerge(wrappedFoundation)),
  NodeHttpClient.layerUndici,
  ephemeralPortConfigLayer,
)

const publishBaseUrl = (baseUrl: Deferred.Deferred<string>): Layer.Layer<never, never, HttpServer.HttpServer> =>
  Layer.effectDiscard(HttpServer.addressFormattedWith((formatted) => Deferred.succeed(baseUrl, formatted)))

export const TestServerLayer: Layer.Layer<TestServer> = Layer.unwrap(
  Effect.gen(function*() {
    const baseUrl = yield* Deferred.make<string>()
    const supervised = publishBaseUrl(baseUrl).pipe(
      Layer.provideMerge(HttpLive),
      supervisedApplication('inventory-fulfillment'),
    )
    return supervised.layer.pipe(
      Layer.provideMerge(rootLayer),
      Layer.flatMap((context) =>
        Layer.effect(
          TestServer,
          Effect.map(Deferred.await(baseUrl), (formatted) => buildService(context, formatted)),
        )
      ),
    )
  }),
)
