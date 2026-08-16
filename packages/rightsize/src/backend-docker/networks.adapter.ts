/**
 * Docker `VirtualNetworks` adapter — native bridge networks (R9).
 *
 * `ensureNetwork` idempotently resolves a network NAME to its
 * daemon-assigned id via a list filter, creating it when missing; the id is
 * cached per adapter instance so repeated ensures on the same name skip the
 * lookup. `removeNetwork` resolves through this instance's own cache when
 * available — the common case — but falls back to the same by-name daemon
 * lookup when it isn't, because the reaper sweep and watchdog call this
 * through a FRESH adapter instance that never itself called
 * `ensureNetwork` for a network some other (possibly dead) process created;
 * an in-memory-only lookup would silently no-op every cross-process reap.
 * "Not found" is silently fine either way.
 *
 * `installNetworkLinks` is a no-op: docker relies entirely on native
 * networks (`create`'s connect step); there is nothing to emulate here.
 *
 * Behavioral reference: upstream rightsize-node
 * `src/backend-docker/backend.ts` (`lookupNetworkIdByName`,
 * `ensureNetworkGetId`, `removeNetwork`, `installNetworkLinks`, Apache-2.0).
 *
 * @since 0.1.0
 */
import { Effect, Option, Schema as S } from 'effect'
import { BackendError } from '../model/errors.js'
import type { VirtualNetworksService } from '../runtime/runtime.js'
import type { DockerClient } from './client.js'
import { decodeCollectionIds, decodeResponseBody } from './response.decode.js'
import { NetworkConnectRequest, NetworkCreateRequest, NetworkCreateResponse } from './wire/network.schema.js'

/** `POST /networks/{id}/connect` body for one container + its endpoint aliases. */
const connectBody = (containerId: string, aliases: readonly string[]): string =>
  JSON.stringify(
    S.encodeSync(NetworkConnectRequest)({ Container: containerId, EndpointConfig: { Aliases: [...aliases] } }),
  )

/** `POST /networks/create` body for one network name. */
const createBody = (networkId: string): string =>
  JSON.stringify(S.encodeSync(NetworkCreateRequest)({ Name: networkId }))

/** The by-name filter query for `GET /networks?filters=…`. */
const nameFilterQuery = (networkId: string): string => encodeURIComponent(JSON.stringify({ name: [networkId] }))

/** The wire-level connect call `create` performs for a spec with a network: `POST /networks/{id}/connect`. Exported so the runtime adapter composes it. */
export const connectContainerToNetwork = (
  client: DockerClient,
  containerId: string,
  networkId: string,
  aliases: readonly string[],
): Effect.Effect<void, BackendError> =>
  Effect.gen(function*() {
    const resp = yield* client.request('POST', `/networks/${networkId}/connect`, connectBody(containerId, aliases))
    if (resp.status >= 400) {
      return yield* BackendError.make({
        message:
          `docker could not connect container ${containerId} to network ${networkId} (HTTP ${resp.status}): ${resp.body.toString()}`,
      })
    }
  })

/**
 * Resolves a network NAME to its daemon-assigned id via a list filter,
 * never failing on "not found" (an empty list, or the list call itself
 * failing) — both callers treat "not found" as their own case.
 */
const lookupNetworkIdByName = (
  client: DockerClient,
  networkId: string,
): Effect.Effect<string | undefined, never> =>
  Effect.gen(function*() {
    const filters = nameFilterQuery(networkId)
    const listed = yield* client.request('GET', `/networks?filters=${filters}`).pipe(Effect.option)
    if (Option.isNone(listed)) {
      return undefined
    }
    if (listed.value.status !== 200) {
      return undefined
    }
    const ids = yield* decodeCollectionIds(listed.value.body.toString())
    return ids[0]
  })

/** One adapter instance's name→daemon-id cache (best-effort; the by-name fallback covers every cross-process path). */
interface NetworksState {
  readonly ids: Map<string, string>
}

const ensureNetworkGetId = (
  client: DockerClient,
  state: NetworksState,
  networkId: string,
): Effect.Effect<string, BackendError> =>
  Effect.gen(function*() {
    const cached = state.ids.get(networkId)
    if (cached !== undefined) {
      return cached
    }

    const found = yield* lookupNetworkIdByName(client, networkId)
    if (found !== undefined) {
      state.ids.set(networkId, found)
      return found
    }

    const created = yield* client.request('POST', '/networks/create', createBody(networkId))
    if (created.status >= 400) {
      return yield* BackendError.make({
        message: `docker could not create network '${networkId}' (HTTP ${created.status}): ${created.body.toString()}`,
      })
    }
    const decoded = yield* decodeResponseBody(NetworkCreateResponse, 'networkCreate')(created.body.toString())
    state.ids.set(networkId, decoded.Id)
    return decoded.Id
  })

const removeNetworkEffect = (
  client: DockerClient,
  state: NetworksState,
  networkId: string,
): Effect.Effect<void, BackendError> =>
  Effect.gen(function*() {
    const cached = state.ids.get(networkId)
    const daemonId = cached !== undefined ? cached : yield* lookupNetworkIdByName(client, networkId)
    state.ids.delete(networkId)
    if (daemonId !== undefined) {
      // Best-effort: teardown callers swallow failures; "not found" is fine.
      yield* client.request('DELETE', `/networks/${daemonId}`).pipe(Effect.ignore)
    }
  })

/** The docker {@link VirtualNetworksService} over one client. Each instance keeps its own cache. */
export const makeDockerNetworks = (client: DockerClient): VirtualNetworksService => {
  const state: NetworksState = { ids: new Map<string, string>() }
  return {
    ensureNetwork: (networkId: string) => ensureNetworkGetId(client, state, networkId).pipe(Effect.asVoid),
    removeNetwork: (networkId: string) => removeNetworkEffect(client, state, networkId),
    installNetworkLinks: () => Effect.void,
  }
}
