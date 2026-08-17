/**
 * Saves and restores serializable atom state.
 *
 * `dehydrate` reads atoms marked with `Atom.serializable` from an
 * `AtomRegistry` and returns encoded entries keyed by their serialization keys.
 * `hydrate` preloads those entries into another registry before the atoms are
 * read. Initial `AsyncResult` values can be ignored, encoded as values, or
 * represented by a `Deferred` that updates the target registry once the result
 * is no longer initial.
 *
 * @since 4.0.0
 */
import * as Clock from 'effect/Clock'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import type * as Fiber from 'effect/Fiber'
import * as Atom from './Atom.js'
import type * as AtomRegistry from './Registry.js'
import * as AsyncResult from './Result.js'

/**
 * Marker interface for entries in a dehydrated atom registry state.
 *
 * @category models
 * @since 4.0.0
 */
export interface DehydratedAtom {
  readonly '~effect/reactivity/DehydratedAtom': true
}

/**
 * A dehydrated serializable atom value.
 *
 * **Details**
 *
 * It stores the atom serialization key, encoded value, dehydration timestamp,
 * and an optional `Deferred` used when an `AsyncResult.Initial` value is
 * encoded as a future non-initial value.
 *
 * @category models
 * @since 4.0.0
 */
export interface DehydratedAtomValue extends DehydratedAtom {
  readonly key: string
  readonly value: unknown
  readonly dehydratedAt: number
  readonly result?: Deferred.Deferred<unknown> | undefined
}

/**
 * Encodes the serializable atoms currently stored in a registry into dehydrated
 * state.
 *
 * **Details**
 *
 * Only atoms marked with `Atom.serializable` are included. `encodeInitialAs`
 * controls whether `AsyncResult.Initial` values are ignored, encoded as values,
 * or represented by a `Deferred` that completes when the atom leaves the
 * initial state.
 *
 * @category dehydration
 * @since 4.0.0
 */
export const dehydrate = (
  registry: AtomRegistry.Registry,
  options?: {
    /**
     * How to encode `AsyncResult.Initial` values. Default is "ignore".
     */
    readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
  },
): DehydratedAtomValue[] => {
  const encodeInitialResultMode = options?.encodeInitialAs ?? 'ignore'
  const arr: DehydratedAtomValue[] = []
  const now = Effect.runSync(Clock.currentTimeMillis)
  registry.getNodes().forEach((node, key) => {
    if (!Atom.isSerializable(node.atom)) return
    const atom = node.atom
    const value = node.value()
    const isInitial = AsyncResult.isAsyncResult(value) && AsyncResult.isInitial(value)
    if (encodeInitialResultMode === 'ignore' && isInitial) return
    // Serializable atoms are always registered under their serialization key
    // (see `Registry.atomKey`), so a serializable node's map key is a string.
    if (typeof key !== 'string') return
    const serializer = atom[Atom.SerializableTypeId]
    const encodedValue = serializer.encode(value)

    // Create a Deferred that completes when the atom moves out of Initial state
    let result: Deferred.Deferred<unknown> | undefined
    if (encodeInitialResultMode === 'deferred' && isInitial) {
      const deferred = Deferred.makeUnsafe<unknown>()
      const unsubscribe = registry.subscribe(atom, (newValue) => {
        if (AsyncResult.isAsyncResult(newValue) && !AsyncResult.isInitial(newValue)) {
          Deferred.doneUnsafe(deferred, Effect.succeed(serializer.encode(newValue)))
          unsubscribe()
        }
      })
      result = deferred
    }

    arr.push({
      '~effect/reactivity/DehydratedAtom': true,
      key,
      value: encodedValue,
      dehydratedAt: now,
      result,
    })
  })
  return arr
}

/**
 * Applies dehydrated atom state to a registry.
 *
 * **When to use**
 *
 * Use to preload serialized atom values into a target registry before those
 * atoms are read.
 *
 * **Details**
 *
 * Encoded values are preloaded by serialization key. Entries with a `result`
 * Deferred update the matching registry node, or preload the resolved value,
 * when the Deferred completes.
 *
 * Returns a fiber that completes once every pending `result` Deferred has been
 * applied to the registry. Callers that need the state fully settled — tests,
 * SSR flushes — can join it; fire-and-forget callers can ignore it.
 *
 * @category hydration
 * @since 4.0.0
 */
export const hydrate = (
  registry: AtomRegistry.Registry,
  dehydratedState: Iterable<DehydratedAtomValue>,
): Fiber.Fiber<void, never> => {
  const pending: Effect.Effect<void>[] = []
  for (const datom of dehydratedState) {
    registry.setSerializable(datom.key, datom.value)

    // If there's a result Deferred, it means this was in Initial state when
    // dehydrated — update the registry once it completes
    if (!datom.result) continue
    pending.push(
      Effect.flatMap(Deferred.await(datom.result), (resolvedValue) =>
        Effect.sync(() => {
          registry.setSerializable(datom.key, resolvedValue)
        })),
    )
  }
  return Effect.runFork(Effect.forEach(pending, (effect) => effect, { discard: true }))
}
