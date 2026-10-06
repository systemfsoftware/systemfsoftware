import { Layer } from 'effect'
import { dual } from 'effect/Function'
import { HttpRouter } from 'effect/http'
import { RpcSerialization, RpcServer } from 'effect/rpc'
import { type Capabilities, groupOf } from './group.js'
import { layerOf } from './handler.js'

export interface ServerOptions<R> {
  readonly path?: HttpRouter.PathInput | undefined
  readonly provide: Layer.Layer<R>
}

export interface Server {
  readonly handler: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
}

interface Serve {
  <R>(registry: Capabilities<R>, options: ServerOptions<R>): Server
  <R>(options: ServerOptions<R>): (registry: Capabilities<R>) => Server
}

export const serve: Serve = dual(2, <R>(registry: Capabilities<R>, options: ServerOptions<R>): Server => {
  const serverLayer: Layer.Layer<never, never, HttpRouter.HttpRouter> = RpcServer.layerHttp({
    group: groupOf(registry),
    path: options.path ?? '/rpc',
    protocol: 'http',
  }).pipe(
    Layer.provide(layerOf(registry)),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(options.provide),
  )
  return HttpRouter.toWebHandler(serverLayer, { disableLogger: true })
})
