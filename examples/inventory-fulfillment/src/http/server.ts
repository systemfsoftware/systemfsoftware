import { NodeHttpServer } from '@effect/platform-node'
import { Config, Layer } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'
import { layer as authMiddlewareLayer } from '../rpc/auth.middleware.js'
import { FulfillmentRpcs, handlers } from '../rpc/inventory-fulfillment.rpc.js'
import { layer as authRoutesLayer } from './auth.routes.js'

const nodeServerFactory = () => process.getBuiltinModule('http').createServer()

export const httpServerLayer = NodeHttpServer.layerConfig(nodeServerFactory, {
  port: Config.Number('PORT').pipe(Config.withDefault(3000)),
})

const rpcLayer = RpcServer.layerHttp({ group: FulfillmentRpcs, path: '/rpc', protocol: 'http' }).pipe(
  Layer.provide(handlers),
  Layer.provide(authMiddlewareLayer),
  Layer.provide(RpcSerialization.layerJson),
)

const appLayer = Layer.mergeAll(rpcLayer, authRoutesLayer)

export const routerLayer = HttpRouter.serve(appLayer)

export const layer = routerLayer.pipe(Layer.provide(httpServerLayer))
