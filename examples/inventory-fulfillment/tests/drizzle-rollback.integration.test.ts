import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Persistence } from '@systemfsoftware/example-inventory-fulfillment'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const rollbackWorld: Layer.Layer<Persistence.DrizzleSession.DrizzleSession> = Persistence.DrizzleSession.layerTest.pipe(
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

const REFUSED_WAREHOUSE = 'warehouse-refused-on-business-grounds'

const refusalTagOf = <A, E>(exit: Exit.Exit<A, E>): string =>
  Exit.isSuccess(exit)
    ? 'Committed'
    : Option.match(Cause.findErrorOption(exit.cause), {
      onNone: () => 'NoRefusal',
      onSome: () => 'BusinessRefusal',
    })

const rowsLeftBehind = (warehouseId: string) =>
  Effect.flatMap(Persistence.DrizzleSession.DrizzleSession, (db) =>
    Effect.map(
      db.select().from(Persistence.Tables.warehouses).where(eq(Persistence.Tables.warehouses.id, warehouseId)),
      (rows) => rows.length,
    ))

const refusedWrite: Effect.Effect<
  { readonly refusal: string; readonly rows: number },
  EffectDrizzleQueryError,
  Persistence.DrizzleSession.DrizzleSession
> = Effect.gen(function*() {
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const exit = yield* Effect.exit(
    db.transaction((tx) =>
      Effect.flatMap(
        tx.insert(Persistence.Tables.warehouses).values({ id: REFUSED_WAREHOUSE, region: 'central' }),
        () => Effect.fail(new Fulfillment.Decision.OptimisticConflict()),
      )
    ),
  )
  const rows = yield* rowsLeftBehind(REFUSED_WAREHOUSE)
  return { refusal: refusalTagOf(exit), rows }
})

Feature('Transactions refused for business reasons leave nothing behind')
  .withScenarioLayer(rollbackWorld)
  .body(({ scenario }) => {
    scenario(
      'A write refused for business reasons surfaces that refusal unchanged and writes nothing',
      Gherkin.Do.pipe(
        Given('a warehouse row written halfway through a transaction')('outcome', () => refusedWrite),
        Then('the refusal is the business refusal, unchanged, and the row never appeared')((s) => {
          expect(s.outcome).toEqual({ refusal: 'BusinessRefusal', rows: 0 })
        }),
      ),
    )
  })
