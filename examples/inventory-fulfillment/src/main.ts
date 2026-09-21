import { NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'
import { layer as serverLayer } from './http/server.js'
import { layer as authLayer } from './store/AuthServiceLive.js'
import { layer as pgProdLayer } from './store/PgProd.layer.js'

const program = serverLayer.pipe(
  Layer.provide(authLayer),
  Layer.provide(pgProdLayer),
  Layer.orDie,
)

NodeRuntime.runMain(Layer.launch(program))
