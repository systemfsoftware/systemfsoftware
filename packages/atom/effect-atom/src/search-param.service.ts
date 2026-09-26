/**
 * Registry-storage identity for the URL search-parameter write coordinator.
 *
 * The coordinator lives in a `*.service.ts` module because the atom blueprint
 * may not declare a `Context.Service`: a blueprint carries no ambient
 * environment identity, so its private per-registry cache keys live beside the
 * other service identities (see `current-registry.service.ts`).
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import type * as Registry from './registry.handle.js'

export interface SearchParamCoordinator {
  generation: number
  readonly updates: Map<string, string>
  updating: boolean
  readonly registry: Registry.Registry
}

/**
 * Registry-storage key for the search-parameter coordinator.
 *
 * @since 4.0.0
 */
export class SearchParamUpdates extends Context.Service<SearchParamUpdates, SearchParamCoordinator>()(
  '@systemfsoftware/effect-atom/search-param/SearchParamUpdates',
) {}
