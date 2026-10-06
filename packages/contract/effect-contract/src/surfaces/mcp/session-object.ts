import { Layer } from 'effect'
import { McpProtocol } from 'effect/ai'
import { dual } from 'effect/Function'
import { HttpRouter } from 'effect/http'
import type { McpMount } from './mount.js'
import { layer, type McpServerOptions } from './server.js'
import { type Capabilities } from './toolkit.js'

export { SESSION_HEADER } from './extension.js'

export const legacyProtocols: readonly [
  McpProtocol.ProtocolAdapter,
  ...ReadonlyArray<McpProtocol.ProtocolAdapter>,
] = [
  McpProtocol.v2025_11_25,
  McpProtocol.v2025_06_18,
  McpProtocol.v2025_03_26,
  McpProtocol.v2024_11_05,
]

export interface SessionLayer {
  <R>(registry: Capabilities<R>, options: McpServerOptions<R>): Layer.Layer<never, never, HttpRouter.HttpRouter>
  <R>(options: McpServerOptions<R>): (registry: Capabilities<R>) => Layer.Layer<never, never, HttpRouter.HttpRouter>
}

export const sessionLayer: SessionLayer = dual(2, <R>(
  registry: Capabilities<R>,
  options: McpServerOptions<R>,
): Layer.Layer<never, never, HttpRouter.HttpRouter> => layer(registry, { ...options, protocols: legacyProtocols }))

export interface SessionServe {
  <R>(registry: Capabilities<R>, options: McpServerOptions<R>): McpMount
  <R>(options: McpServerOptions<R>): (registry: Capabilities<R>) => McpMount
}

export const sessionServe: SessionServe = dual(2, <R>(
  registry: Capabilities<R>,
  options: McpServerOptions<R>,
): McpMount => HttpRouter.toWebHandler(sessionLayer(registry, options), { disableLogger: true }))
