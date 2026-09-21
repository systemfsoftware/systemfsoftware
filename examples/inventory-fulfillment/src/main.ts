import { NodeRuntime } from '@effect/platform-node'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import { AuthService, makeAuth } from './http/auth.routes.js'
import { layer as serverLayer } from './http/server.js'
import { layer as pgProdLayer, PgRuntime } from './store/PgProd.layer.js'

const authLayer = Layer.effect(
  AuthService,
  Effect.gen(function*() {
    const runtime = yield* PgRuntime
    return makeAuth(drizzle({ client: runtime.pool }), runtime.betterAuthSecret)
  }),
)

const program = serverLayer.pipe(
  Layer.provide(authLayer),
  Layer.provide(pgProdLayer),
  Layer.orDie,
)

NodeRuntime.runMain(Layer.launch(program))
