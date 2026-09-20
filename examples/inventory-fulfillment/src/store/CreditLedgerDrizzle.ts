import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { Effect, Layer, Option } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { CustomerCredit } from '../ports/CreditLedger.js'
import { CreditLedger } from '../ports/CreditLedger.js'
import { decodeCreditAccount, decodeCustomerTier } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { user } from './schema.tables.js'

type UserRow = typeof user.$inferSelect

const accountRowOf = (row: UserRow) => ({
  customerId: row.id,
  creditLimit: row.creditLimit,
  outstandingBalance: row.outstandingBalance,
  overdraftPrivilege: row.overdraftPrivilege,
})

const creditOf = (row: UserRow): Effect.Effect<CustomerCredit, SchemaError> =>
  Effect.gen(function*() {
    const account = yield* decodeCreditAccount(accountRowOf(row))
    const tier = yield* decodeCustomerTier(row.tier)
    return { account, tier }
  })

const readCredit = (db: DrizzleDatabase, customerId: string) =>
  Effect.gen(function*() {
    const rows: readonly UserRow[] = yield* db.select().from(user).where(eq(user.id, customerId))
    return yield* Option.match(Option.fromUndefinedOr(rows[0]), {
      onNone: () => Effect.die(new Error(`CreditLedger: no credit account for customer ${customerId}`)),
      onSome: (row) => creditOf(row),
    })
  })

export const layer: Layer.Layer<CreditLedger, never, DrizzleSession> = Layer.effect(
  CreditLedger,
  Effect.gen(function*() {
    const db = yield* DrizzleSession
    return {
      readCredit: (customerId: string) => readCredit(db, customerId).pipe(Effect.orDie),
    }
  }),
)
