import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Persistence } from '@systemfsoftware/example-inventory-fulfillment'
import { ConfigProvider, Context, Effect, Layer } from 'effect'
import { PgSocketServer, PgSocketServerLive } from './__fixtures__/pg-socket.fixture.js'

const Feature = makeFeature({ it })

interface WarehouseRow {
  readonly id: string
  readonly region: string
}

const options = (databaseUrl: string) =>
  ConfigProvider.layer(
    ConfigProvider.fromUnknown({
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: 'an-inventory-fulfillment-test-secret',
    }),
  )

const writeAndReadWarehouse = (databaseUrl: string): Effect.Effect<ReadonlyArray<WarehouseRow>> =>
  Effect.orDie(
    Effect.scoped(
      Effect.gen(function*() {
        const context = yield* Layer.build(Persistence.PgRuntime.PgRuntimeLive)
        const session = Context.get(context, Persistence.DrizzleSession.DrizzleSession)
        yield* session.insert(Persistence.Tables.warehouses).values({ id: 'warehouse-release-check', region: 'north' })
        return yield* session.select().from(Persistence.Tables.warehouses)
      }),
    ),
  ).pipe(Effect.provide(options(databaseUrl)))

Feature('Starting the app database root against a real postgres socket')
  .withScenarioLayer(PgSocketServerLive)
  .live('the app database root opens a real node-postgres socket to PGlite, which the simulation kernel cannot run')
  .body(({ scenario }) => {
    scenario(
      'A warehouse written through the migrated schema is read back',
      Gherkin.Do.pipe(
        Given('a postgres server listening on an ephemeral port')('server', () => PgSocketServer),
        When('the app database root starts and writes a warehouse through its migrated schema')(
          'rows',
          (s) => writeAndReadWarehouse(s.server.databaseUrl),
        ),
        Then('the warehouse is read back from the migrated table')((s) => {
          if (!s.rows.some((row) => row.id === 'warehouse-release-check' && row.region === 'north')) {
            throw new Error('the migrated warehouses table did not return the written row')
          }
        }),
      ),
    )
  })
