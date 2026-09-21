import { type Auth, betterAuth, type BetterAuthOptions } from 'better-auth'
import { type DB, drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect } from 'effect'
import { PgRuntime } from './PgRuntime.js'
import { account, session, user, verification } from './schema.tables.js'

const options = (database: DB, secret: string): BetterAuthOptions => ({
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  secret,
})

export const makeAuth = (database: DB, secret: string): Auth => betterAuth(options(database, secret))

export const make = Effect.gen(function*() {
  const runtime = yield* PgRuntime
  return makeAuth(drizzle({ client: runtime.pool }), runtime.betterAuthSecret)
})
