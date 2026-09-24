import { sql } from 'drizzle-orm'
import { and, eq } from 'drizzle-orm/sql/expressions/conditions'
import { DateTime, Effect, Layer, Match, Option, Record as Record_, Schema as S } from 'effect'
import type { Money } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound, StoreUnavailable } from '../fulfillment/decision.schema.js'
import { type SettlementCommand, type SettlementOutcome, SettlementStore } from '../ports/SettlementStore.service.js'
import { decodeCreditAccount, decodeCustomerTier } from './decode.js'
import { type DrizzleDatabase, DrizzleSession } from './DrizzleSession.js'
import { auditEvents, reservations, stockLots, user } from './schema.tables.js'
import { type ClaimedLot, claimedLots, creditObservation, mintCreditProof, mintStockProof } from './SettlementProof.js'
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
  }).pipe(Effect.catchTags({
    SchemaError: (cause) => Effect.fail(new StoreUnavailable({ cause })),
    EffectDrizzleQueryError: (cause) => Effect.fail(new StoreUnavailable({ cause })),
  }))

const readAllStock = (db: DrizzleDatabase) =>
  Effect.gen(function*() {
    const lots: readonly StockLotRow[] = yield* db.select().from(stockLots)
    const versions = Record_.fromIterableWith(lots, (lot) => [lot.id, lot.version])
    return { partitions: yield* partitionsFor(db, lots), proof: mintStockProof(versions) }
  }).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

const settle = (db: DrizzleDatabase, command: SettlementCommand): Effect.Effect<SettlementOutcome, StoreUnavailable> =>
  Option.match(claimedLots(command), {
    onNone: () => Effect.succeed('Conflict'),
    onSome: (claims) => commitClaims(db, command, claims),
  })

const commitClaims = (
  db: DrizzleDatabase,
  command: SettlementCommand,
  claims: ReadonlyArray<ClaimedLot>,
): Effect.Effect<SettlementOutcome, StoreUnavailable> => {
  class VersionMoved extends S.TaggedError<VersionMoved>()('VersionMoved', {}) {}
  const failMoved = Effect.fail(new VersionMoved())
  return db
    .transaction((tx) =>
      Effect.gen(function*() {
        yield* Option.match(command.charge, {
          onNone: () => Effect.void,
          onSome: (charge) => {
            const observed = creditObservation(charge.proof)
            const amount: Money = charge.amount
            return Match.value(observed.customerId === command.customerId).pipe(
              Match.when(false, () => failMoved),
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
                  (updated) => (updated.length === 1 ? Effect.void : failMoved),
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
            (updated) => (updated.length === 1 ? Effect.void : failMoved),
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
      Effect.catchTags(
        { VersionMoved: () => Effect.succeed('Conflict' as const) },
        (cause) => Effect.fail(new StoreUnavailable({ cause })),
      ),
    )
}

export const layer: Layer.Layer<SettlementStore, never, DrizzleSession> = Layer.effect(
  SettlementStore,
  Effect.gen(function*() {
    const db = yield* DrizzleSession
    return {
      readCredit: (customerId: string) => readCredit(db, customerId),
      readAllStock: readAllStock(db),
      settle: (command: SettlementCommand) => settle(db, command),
    }
  }),
)
