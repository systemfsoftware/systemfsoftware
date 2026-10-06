import { NodeHttpServer } from '@effect/platform-node'
import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Context, Effect, Layer, Result } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import type { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServer from 'effect/http/HttpServer'
import * as NetAddress from 'effect/net/NetAddress'
import { EmulatorAdmin, layer as adminLayer } from './admin.js'
import type { EmulatorAdminShape } from './admin.js'
import {
  basinCatalogManagementHandlers,
  credentialManagementHandlers,
  maintenanceConfigurationHandlers,
  namespaceManagementHandlers,
  tableMaintenanceConfigurationHandlers,
  tableManagementHandlers,
} from './handlers/basin-catalog.js'
import { containerApplicationsHandlers } from './handlers/container-applications.js'
import { containerImagesHandlers } from './handlers/container-images.js'
import { containerInstancesHandlers } from './handlers/container-instances.js'
import { issuesAutomationHandlers } from './handlers/issues-automation.js'
import { monetizationHandlers } from './handlers/monetization.js'
import { notificationPolicyHandlers } from './handlers/notification-policy.js'
import { notificationWebhookHandlers } from './handlers/notification-webhook.js'
import { observabilityDestinationHandlers } from './handlers/observability-destinations.js'
import { observabilityHandlers } from './handlers/observability.js'
import { r2BucketHandlers } from './handlers/r2-bucket.js'
import { spectrumApplicationHandlers } from './handlers/spectrum-applications.js'
import { telemetryQueryHandlers } from './handlers/telemetry-query.js'
import { urlScannerHandlers } from './handlers/url-scanner.js'
import { workersK2OtherHandlers } from './handlers/workers-k2-other.js'
import { workersKvNamespaceHandlers } from './handlers/workers-kv-namespace.js'
import { workersPipelinesOtherHandlers } from './handlers/workers-pipelines-other.js'
import { workersScriptHandlers } from './handlers/workers-script.js'
import { workersSubdomainHandlers } from './handlers/workers-subdomain.js'
import { discardLayer, recordRequests } from './request-log/request-log.js'
import { layer as storeLayer } from './state/emulator-store.js'

export interface EmulatorShape {
  readonly baseUrl: string
  readonly admin: EmulatorAdminShape
}

export class Emulator extends Context.Service<Emulator, EmulatorShape>()(
  '@systemfsoftware/cloudflare-emulator/Emulator',
) {}

export const HANDLER_LAYERS = [
  workersK2OtherHandlers,
  workersPipelinesOtherHandlers,
  r2BucketHandlers,
  workersKvNamespaceHandlers,
  basinCatalogManagementHandlers,
  credentialManagementHandlers,
  maintenanceConfigurationHandlers,
  namespaceManagementHandlers,
  tableManagementHandlers,
  tableMaintenanceConfigurationHandlers,
  urlScannerHandlers,
  monetizationHandlers,
  issuesAutomationHandlers,
  notificationWebhookHandlers,
  notificationPolicyHandlers,
  spectrumApplicationHandlers,
  observabilityHandlers,
  observabilityDestinationHandlers,
  telemetryQueryHandlers,
  containerApplicationsHandlers,
  containerInstancesHandlers,
  containerImagesHandlers,
  workersScriptHandlers,
  workersSubdomainHandlers,
] as const

const inetAddress = (address: NetAddress.SocketAddress): NetAddress.InetAddress => {
  if (NetAddress.isUnixPathAddress(address)) {
    throw new Error('the emulator listens on a TCP socket, not a unix socket')
  }
  return address
}

export const originOf = (address: NetAddress.SocketAddress): string => {
  const inet = inetAddress(address)
  const url = Result.getOrThrow(NetAddress.toUrl(inet))
  if (NetAddress.isUnspecified(inet.address)) {
    url.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback)
  }
  return url.origin
}

const permit = <A>(handler: A): A => handler

// The generated contract does not export its email/api-key middleware, so the
// permissive auth seam is provided by context key rather than by service class.
const middlewareServices = {
  'api_token security': { api_token: permit },
  'api_email & api_key security': permit,
  'api_token | user_service_key security': { api_token: permit, user_service_key: permit },
}

type ContractGroups = typeof CloudflareApi extends HttpApi.HttpApi<string, infer Groups> ? Groups : never

type ContractAuth = HttpApiEndpoint.Middleware<HttpApiGroup.Endpoints<ContractGroups>>

const middlewareContext = Context.makeUnsafe<ContractAuth>(new Map(Object.entries(middlewareServices)))

export const permissiveAuthLayer = Layer.succeedContext(middlewareContext)

const emulatorLayer = Layer.effect(
  Emulator,
  Effect.gen(function*() {
    const server = yield* HttpServer.HttpServer
    const admin = yield* EmulatorAdmin
    return { baseUrl: originOf(server.address), admin }
  }),
)

const groupsWithAuth = Layer.mergeAll(...HANDLER_LAYERS).pipe(Layer.provide(permissiveAuthLayer))

const appLayer = HttpApiBuilder.layer(CloudflareApi).pipe(Layer.provide(groupsWithAuth))

const served = HttpRouter.serve(appLayer, { disableLogger: true, disableListenLog: true, middleware: recordRequests })

export const layerOn = <A, E, R>(platform: Layer.Layer<A, E, R>) =>
  emulatorLayer.pipe(
    Layer.provideMerge(adminLayer),
    Layer.provideMerge(served),
    Layer.provideMerge(Layer.mergeAll(storeLayer, platform)),
  )

export const layer = layerOn(Layer.mergeAll(NodeHttpServer.layerTest, discardLayer))
