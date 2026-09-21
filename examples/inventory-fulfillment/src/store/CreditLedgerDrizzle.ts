import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { Effect, Option } from 'effect'
import type { SchemaError } from 'effect/Schema'
import type { Money } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound } from '../fulfillment/decision.schema.js'
import type { CustomerCredit } from '../ports/CreditLedger.js'
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
      onNone: () =>
        Effect.fail(new CreditAccountNotFound({ customerId, reason: `no credit account for customer ${customerId}` })),
      onSome: (row) => creditOf(row),
    })
  })

const charge = (db: DrizzleDatabase, customerId: string, amount: Money) =>
  Effect.gen(function*() {
    const updated = yield* db
      .update(user)
      .set({ outstandingBalance: sql`${user.outstandingBalance} + ${amount}` })
      .where(eq(user.id, customerId))
      .returning({ id: user.id })
    return yield* Option.match(Option.fromUndefinedOr(updated[0]), {
      onNone: () => Effect.die(new Error(`credit charge: no credit account for customer ${customerId}`)),
      onSome: () => Effect.void,
    })
  })

export const make = Effect.gen(function*() {
  const db = yield* DrizzleSession
  return {
    readCredit: (customerId: string) => readCredit(db, customerId),
    charge: (customerId: string, amount: Money) => charge(db, customerId, amount).pipe(Effect.orDie),
  }
})
