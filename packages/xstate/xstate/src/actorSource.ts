import type { AnyActorLogic } from './types.js'

const sourceKeyCaches = new WeakMap<object, Map<AnyActorLogic, string>>()

/** @internal */
export function resolveRegisteredActorSource(
  actors: Record<string, AnyActorLogic>,
  logic: AnyActorLogic,
): string | undefined {
  let cache = sourceKeyCaches.get(actors)
  if (!cache) {
    cache = new Map()
    for (const [key, registeredLogic] of Object.entries(actors)) {
      // Several source keys may intentionally share one implementation. The
      // first key is its canonical persistence identity when spawning by the
      // raw logic value, which cannot retain which alias was used to access it.
      if (!cache.has(registeredLogic)) {
        cache.set(registeredLogic, key)
      }
    }
    sourceKeyCaches.set(actors, cache)
  }

  return cache.get(logic)
}
