import { dual } from 'effect/Function'
import { HttpRouter } from 'effect/http'
import { layer, type McpServerOptions } from './server.js'
import { type Capabilities } from './toolkit.js'

export interface McpMount {
  readonly handler: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
}

export interface Mount {
  <R>(registry: Capabilities<R>, options: McpServerOptions<R>): McpMount
  <R>(options: McpServerOptions<R>): (registry: Capabilities<R>) => McpMount
}

export const mount: Mount = dual(2, <R>(
  registry: Capabilities<R>,
  options: McpServerOptions<R>,
): McpMount => HttpRouter.toWebHandler(layer(registry, options), { disableLogger: true }))
