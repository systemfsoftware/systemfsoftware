import { NodeHttpServer } from '@effect/platform-node'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Config, Effect, Layer } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import { HttpRouter } from 'effect/unstable/http'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'
import { layer as authMiddlewareLayer } from '../rpc/AuthMiddlewareLive.js'
import { FulfillmentRpcs, handlers } from '../rpc/inventory-fulfillment.rpc.js'
import { AuthRoutesLive } from './auth.routes.js'

const nodeServerFactory = () => process.getBuiltinModule('http').createServer()

export const httpServerLayer = NodeHttpServer.layerConfig(nodeServerFactory, {
  port: Config.Number('PORT').pipe(Config.withDefault(3000)),
})

const rpcLayer = RpcServer.layerHttp({ group: FulfillmentRpcs, path: '/rpc', protocol: 'http' }).pipe(
  Layer.provide(handlers),
  Layer.provide(authMiddlewareLayer),
  Layer.provide(RpcSerialization.layerJson),
)

const appLayer = Layer.mergeAll(rpcLayer, AuthRoutesLive)

export const routerLayer = HttpRouter.serve(appLayer)

export const HttpLive = routerLayer.pipe(Layer.provideMerge(httpServerLayer))

const httpServerChild = <A, E, R>(
  app: Layer.Layer<A, E, R>,
): (ready: Effect.Effect<void>) => Effect.Effect<never, never, Scope.Scope | R> =>
(ready) =>
  Effect.gen(function*() {
    yield* Layer.build(app).pipe(Effect.orDie)
    yield* ready
    return yield* Effect.never
  })

/**
 * The supervised application (KTD18): one supervisor whose only child is the
 * HTTP server, permanent because an application without its server has no
 * meaning. `R` is every service the server's layers need, so the composition
 * root provides the database and auth layers to `.layer`.
 */
export const supervisedApplication: {
  <A, E, R>(name: string): (app: Layer.Layer<A, E, R>) => Supervisor.SupervisorSpec<R>
  <A, E, R>(app: Layer.Layer<A, E, R>, name: string): Supervisor.SupervisorSpec<R>
} = dual(
  2,
  <A, E, R>(app: Layer.Layer<A, E, R>, name: string): Supervisor.SupervisorSpec<R> =>
    Supervisor.make(name).pipe(
      Supervisor.children([
        Supervisor.ChildSpecs.make<R>('http', httpServerChild(app), { restartType: 'permanent' }),
      ]),
    ),
)
