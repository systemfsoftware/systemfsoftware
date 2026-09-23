import { sql } from 'drizzle-orm'
import { and, eq } from 'drizzle-orm/sql/expressions/conditions'
import { DateTime, Effect, Match, Option, Record as Record_ } from 'effect'
import type { Money } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound } from '../fulfillment/decision.schema.js'
import type { SettlementCommand, SettlementOutcome } from '../ports/SettlementStore.js'
import { decodeCreditAccount, decodeCustomerTier } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { auditEvents, reservations, stockLots, user } from './schema.tables.js'
import { claimedLots, creditObservation, mintCreditProof, mintStockProof } from './SettlementProof.js'
import { partitionsFor, type StockLotRow } from './stockPartitions.js'

type UserRow = typeof user.$inferSelect

const accountRowOf = (row: UserRow) => ({
  customerId: row.id,
  creditLimit: row.creditLimit,
  outstandingBalance: row.outstandingBalance,
  overdraftPrivilege: row.overdraftPrivilege,
})

const readCredit = (db: DrizzleDatabase, customerId: string) =>
  Effect.gen(function*() {
    const rows: readonly UserRow[] = yield* db.select().from(user).where(eq(user.id, customerId))
    return yield* Option.match(Option.fromUndefinedOr(rows[0]), {
      onNone: () =>
        Effect.fail(new CreditAccountNotFound({ customerId, reason: `no credit account for customer ${customerId}` })),
      onSome: (row) =>
        Effect.gen(function*() {
          const account = yield* decodeCreditAccount(accountRowOf(row))
          const tier = yield* decodeCustomerTier(row.tier)
          return { account, tier, proof: mintCreditProof({ customerId: row.id, version: row.creditVersion }) }
        }),
    })
  })

const readAllStock = (db: DrizzleDatabase) =>
  Effect.gen(function*() {
    const lots: readonly StockLotRow[] = yield* db.select().from(stockLots)
    const versions = Record_.fromIterableWith(lots, (lot) => [lot.id, lot.version])
    return { partitions: yield* partitionsFor(db, lots), proof: mintStockProof(versions) }
  })

const settle = (db: DrizzleDatabase, command: SettlementCommand): Effect.Effect<SettlementOutcome> =>
  Option.match(claimedLots(command), {
    onNone: () => Effect.succeed('Conflict'),
    onSome: (claims) =>
      db
        .transaction((tx) =>
          Effect.gen(function*() {
            yield* Option.match(command.charge, {
              onNone: () => Effect.void,
              onSome: (charge) => {
                const observed = creditObservation(charge.proof)
                const amount: Money = charge.amount
                return Match.value(observed.customerId === command.customerId).pipe(
                  Match.when(false, () => tx.rollback()),
                  Match.when(true, () =>
                    Effect.flatMap(
                      tx
                        .update(user)
                        .set({
                          outstandingBalance: sql`${user.outstandingBalance} + ${amount}`,
                          creditVersion: observed.version + 1,
                        })
                        .where(and(eq(user.id, command.customerId), eq(user.creditVersion, observed.version)))
                        .returning({ id: user.id }),
                      (updated) => (updated.length === 1 ? Effect.void : tx.rollback()),
                    )),
                  Match.exhaustive,
                )
              },
            })
            yield* Effect.forEach(claims, (claim) =>
              Effect.flatMap(
                tx
                  .update(stockLots)
                  .set({
                    quantityOnHand: sql`${stockLots.quantityOnHand} - ${claim.quantity}`,
                    version: claim.observedVersion + 1,
                  })
                  .where(and(eq(stockLots.id, claim.lotId), eq(stockLots.version, claim.observedVersion)))
                  .returning({ id: stockLots.id }),
                (updated) => (updated.length === 1 ? Effect.void : tx.rollback()),
              ), { discard: true })
            yield* Effect.forEach(
              claims,
              (claim) =>
                tx.insert(reservations).values({
                  id: `${command.orderId}:${claim.lotId}`,
                  orderId: command.orderId,
                  customerId: command.customerId,
                  sku: claim.sku,
                  warehouseId: claim.warehouseId,
                  lotId: claim.lotId,
                  quantity: claim.quantity,
                  version: claim.observedVersion,
                  occurredAt: DateTime.toDate(command.audit.occurredAt),
                }),
              { discard: true },
            )
            yield* tx.insert(auditEvents).values({
              id: `${command.audit.orderId}:audit`,
              orderId: command.audit.orderId,
              actorId: command.audit.actorId,
              decisionTag: command.audit.decisionTag,
              occurredAt: DateTime.toDate(command.audit.occurredAt),
            })
            return 'Committed' as const
          })
        )
        .pipe(
          Effect.catchTag('EffectTransactionRollbackError', () => Effect.succeed('Conflict' as const)),
          Effect.orDie,
        ),
  })

export const make = Effect.gen(function*() {
  const db = yield* DrizzleSession
  return {
    readCredit: (customerId: string) => readCredit(db, customerId),
    readAllStock: readAllStock(db).pipe(Effect.orDie),
    settle: (command: SettlementCommand) => settle(db, command),
  }
})
