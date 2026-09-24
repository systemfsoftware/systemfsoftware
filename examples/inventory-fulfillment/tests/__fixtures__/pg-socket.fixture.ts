import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { Context, Effect, Layer } from 'effect'

export interface PgSocketServerService {
  readonly databaseUrl: string
}

export class PgSocketServer extends Context.Service<PgSocketServer, PgSocketServerService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/pg-socket/PgSocketServer',
) {}

const openServer = Effect.gen(function*() {
  const db = yield* Effect.promise(() => PGlite.create())
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 })
  yield* Effect.promise(() => server.start())
  return { db, server }
})

const closeServer = ({ db, server }: { readonly db: PGlite; readonly server: PGLiteSocketServer }) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => server.stop())
    yield* Effect.promise(() => db.close())
  })

export const PgSocketServerLive: Layer.Layer<PgSocketServer> = Layer.effect(
  PgSocketServer,
  Effect.map(
    Effect.acquireRelease(openServer, closeServer),
    ({ server }): PgSocketServerService => ({
      databaseUrl: `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    }),
  ),
)
