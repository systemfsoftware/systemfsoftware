/**
 * U0 — Backend Compatibility Spike (throwaway).
 *
 * Proves the four risky composition points of the Backend Stack Contract before
 * any code unit starts:
 *
 *  1. PGlite session: @effect/sql-pglite + drizzle-orm/effect-pglite roundtrip.
 *  2. Transactional CAS: drizzle transaction with UPDATE ... WHERE version =
 *     $expected returning affected rows (both hit and stale-miss).
 *  3. effect/unstable/rpc: RpcGroup + RpcMiddleware + RpcServer.layerHttp on
 *     @effect/platform-node HttpServer, exercised by an in-process RpcClient,
 *     with the drizzle session in context.
 *  4. better-auth: drizzle adapter + signUpEmail + getSession roundtrip.
 *
 * Deleted when U1 lands; this directory never ships.
 */
import { createServer } from 'node:http'

import { NodeHttpClient, NodeHttpServer } from '@effect/platform-node'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { type PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sql } from 'drizzle-orm'
import { makeWithDefaults } from 'drizzle-orm/effect-pglite'
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/pglite'
import { and, eq } from 'drizzle-orm/sql/expressions/conditions'
import { Context, Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from 'effect/unstable/http'
import { Rpc, RpcClient, RpcGroup, RpcMiddleware, RpcSerialization, RpcServer } from 'effect/unstable/rpc'

// ---------------------------------------------------------------------------
// RPC surface: one echo procedure behind an auth middleware whose session
// resolution goes through better-auth against the drizzle-backed PGlite DB.
// ---------------------------------------------------------------------------

class AuthContext extends Context.Service<AuthContext, { readonly userId: string }>()(
  'spike/AuthContext',
) {}

class Unauthorized extends Schema.TaggedError<Unauthorized>()('spike/Unauthorized', {}) {}

class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
  provides: AuthContext
}>()('spike/AuthMiddleware', {
  error: Unauthorized,
}) {}

const Echo = Rpc.make('echo', {
  payload: Schema.Struct({ message: Schema.String }),
  success: Schema.Struct({ message: Schema.String, userId: Schema.String }),
  error: Unauthorized,
}).middleware(AuthMiddleware)

const Group = RpcGroup.make(Echo)

// Minimal drizzle tables: one spike table for the CAS leg, plus the four
// better-auth tables its drizzle adapter expects.

const spikeItems = pgTable('spike_items', {
  id: text('id').primaryKey(),
  qty: integer('qty').notNull(),
  version: integer('version').notNull(),
})

const authUser = pgTable('spike_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

const authSession = pgTable('spike_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull(),
})

const authAccount = pgTable('spike_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

const authVerification = pgTable('spike_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = Effect.gen(function*() {
  // ---- Leg 1: PGlite session roundtrip through drizzle ---------------------
  const db = yield* makeWithDefaults()

  yield* db.execute(
    sql`CREATE TABLE spike_items (id text PRIMARY KEY, qty integer NOT NULL, version integer NOT NULL)`,
  )
  yield* db.execute(
    sql`CREATE TABLE spike_user (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false, image text, created_at timestamp NOT NULL, updated_at timestamp NOT NULL)`,
  )
  yield* db.execute(
    sql`CREATE TABLE spike_session (id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE, created_at timestamp NOT NULL, updated_at timestamp NOT NULL, ip_address text, user_agent text, user_id text NOT NULL)`,
  )
  yield* db.execute(
    sql`CREATE TABLE spike_account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL, access_token text, refresh_token text, id_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text, created_at timestamp NOT NULL, updated_at timestamp NOT NULL)`,
  )
  yield* db.execute(
    sql`CREATE TABLE spike_verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL, created_at timestamp, updated_at timestamp)`,
  )
  yield* db.execute(sql`INSERT INTO spike_items (id, qty, version) VALUES ('sku-1', 5, 1)`)
  const inserted = yield* db.select().from(spikeItems).where(eq(spikeItems.id, 'sku-1'))
  const leg1Row = inserted[0]
  if (leg1Row === undefined || leg1Row.qty !== 5) {
    return yield* Effect.die(new Error('leg 1: PGlite roundtrip lost the row'))
  }
  console.log('[1] PGlite session roundtrip: OK (sku-1 qty=5)')

  // ---- Leg 2: transactional CAS --------------------------------------------
  const casHit = yield* db.transaction((tx) =>
    tx.update(spikeItems)
      .set({ qty: 4, version: 2 })
      .where(and(eq(spikeItems.id, 'sku-1'), eq(spikeItems.version, 1)))
      .returning({ id: spikeItems.id })
  )
  if (casHit.length !== 1) {
    return yield* Effect.die(new Error('leg 2: CAS hit reported no affected rows'))
  }
  const casMiss = yield* db.transaction((tx) =>
    tx.update(spikeItems)
      .set({ qty: 3, version: 3 })
      .where(and(eq(spikeItems.id, 'sku-1'), eq(spikeItems.version, 1)))
      .returning({ id: spikeItems.id })
  )
  if (casMiss.length !== 0) {
    return yield* Effect.die(new Error('leg 2: stale CAS version unexpectedly matched'))
  }
  const afterMiss = yield* db.select().from(spikeItems).where(eq(spikeItems.id, 'sku-1'))
  const afterMissRow = afterMiss[0]
  if (afterMissRow === undefined || afterMissRow.version !== 2) {
    return yield* Effect.die(new Error('leg 2: failed CAS mutated the row'))
  }
  console.log(`[2] transactional CAS: OK (hit rows=${casHit.length}, stale rows=${casMiss.length})`)

  // ---- Leg 4 setup: better-auth over the drizzle adapter -------------------
  // better-auth's adapter is promise-based and cannot drive the Effect-native
  // session, so it gets a promise-mode drizzle view over the SAME raw PGlite
  // instance. One database, two dialect views.
  const rawPglite = yield* Pglite.PgliteClient
  const authDb = drizzle({ client: rawPglite.pglite as PGlite })
  const auth = betterAuth({
    baseURL: 'http://spike.local',
    database: drizzleAdapter(authDb, {
      provider: 'pg',
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    emailAndPassword: { enabled: true },
    secret: 'spike-only-secret-never-production',
  })

  yield* Effect.tryPromise({
    try: () =>
      auth.api.signUpEmail({
        body: { email: 'spike@example.test', password: 'spike-password-123', name: 'Spike' },
      }),
    catch: (cause) => new Error(`leg 4: signUpEmail failed: ${String(cause)}`, { cause }),
  })
  const signOut = yield* Effect.tryPromise({
    try: () =>
      auth.api.signInEmail({
        body: { email: 'spike@example.test', password: 'spike-password-123' },
        asResponse: true,
      }),
    catch: (cause) => new Error(`leg 4: signInEmail failed: ${String(cause)}`, { cause }),
  })
  const setCookie = signOut.headers.get('set-cookie')
  if (setCookie === null || !setCookie.includes('better-auth.session_token')) {
    return yield* Effect.die(new Error('leg 4: signUpEmail returned no session cookie'))
  }
  const session = yield* Effect.tryPromise({
    try: () => auth.api.getSession({ headers: { cookie: setCookie } }),
    catch: (cause) => new Error(`leg 4: getSession failed: ${String(cause)}`, { cause }),
  })
  if (session === null || session.user.email !== 'spike@example.test') {
    return yield* Effect.die(new Error('leg 4: getSession did not resolve the signed-up user'))
  }
  const sessionUserId: string = session.user.id
  console.log(`[4] better-auth signup+getSession: OK (user ${sessionUserId.slice(0, 8)}...)`)

  // ---- Leg 3: RpcGroup + middleware + layerHttp on platform-node -----------
  const AuthMiddlewareLive = Layer.succeed(
    AuthMiddleware,
    (inner, options) =>
      Effect.tryPromise({
        try: () =>
          auth.api.getSession({
            headers: new Headers(Object.entries(options.headers as Record<string, string>)),
          }),
        catch: () => new Unauthorized(),
      }).pipe(
        Effect.flatMap((resolved) =>
          resolved === null
            ? Effect.fail(new Unauthorized())
            : Effect.provideService(inner, AuthContext, { userId: resolved.user.id })
        ),
      ),
  )

  const Handlers = Group.toLayer({
    echo: ({ message }) => Effect.map(AuthContext, ({ userId }) => ({ message, userId })),
  })

  const RpcApp = RpcServer.layerHttp({ group: Group, path: '/rpc', protocol: 'http' }).pipe(
    Layer.provide(Handlers),
    Layer.provide(AuthMiddlewareLive),
    Layer.provide(RpcSerialization.layerJson),
  )
  const ServerLive = HttpRouter.serve(RpcApp)

  yield* Effect.gen(function*() {
    const raw = yield* HttpClient.HttpClient
    const url = yield* HttpServer.addressFormattedWith(Effect.succeed)
    const httpClient = raw.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(`${url}/rpc`)),
      HttpClient.mapRequest(HttpClientRequest.setHeader('cookie', setCookie)),
    )
    const proto = yield* RpcClient.makeProtocolHttp(httpClient).pipe(
      Effect.provide(RpcSerialization.layerJson),
    )
    const client = yield* RpcClient.make(Group).pipe(
      Effect.provideService(RpcClient.Protocol, proto),
    )
    const echoed = yield* client.echo({ message: 'hello spike' })
    if (echoed.userId !== sessionUserId) {
      return yield* Effect.die(new Error('leg 3: echoed userId does not match the session user'))
    }
    console.log(`[3] unstable/rpc over platform-node: OK (echo userId matches session)`)
  }).pipe(
    Effect.scoped,
    Effect.provide(NodeHttpClient.layerUndici),
    Effect.provide(ServerLive),
    Effect.provide(NodeHttpServer.layer(() => createServer(), { port: 0 })),
    Effect.provide(Pglite.layer()),
  )
}).pipe(Effect.provide(Pglite.layer()))

await Effect.runPromise(Effect.orDie(program))
console.log('spike: all four roundtrips green')
