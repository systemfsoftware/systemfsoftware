/**
 * Saves and restores serializable atom state.
 *
 * `dehydrate` reads atoms marked with `Atom.serializable` from an
 * `AtomRegistry` and returns encoded entries keyed by their serialization keys.
 * `hydrate` preloads those entries into another registry before the atoms are
 * read. Initial `AsyncResult` values can be ignored, encoded as values, or
 * carried as a pending update that settles the target registry once the source
 * atom leaves the initial state.
 *
 * @since 4.0.0
 */
import * as Clock from 'effect/Clock'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import type * as Fiber from 'effect/Fiber'
import { dual } from 'effect/Function'
import * as Atom from './Atom.js'
import { isPlainOptions } from './internal/plain-object.js'
import type * as AtomRegistry from './Registry.js'
import * as AsyncResult from './Result.js'

type AnyAtom<A = unknown> = Atom.Atom<A>
type AnyValue<A = unknown> = A
/**
 * Marker interface for entries in a dehydrated atom registry state.
 *
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
 * It stores the atom serialization key, encoded value, and dehydration
 * timestamp.
 *
 * @since 4.0.0
 */
export interface DehydratedAtomValue<V = unknown> extends DehydratedAtom {
  readonly key: string
  readonly value: V
  readonly dehydratedAt: number
}

/**
 * Non-serializable completion channel for entries dehydrated in `'deferred'`
 * mode. Keyed by entry identity so nothing appears on the public surface: the
 * same objects `dehydrate` returns must be handed to `hydrate`. A `Deferred`
 * cannot cross a serialization boundary anyway, so entries that do cross one
 * are simply applied as plain preloads.
 */
type PendingDeferred<V = unknown> = Deferred.Deferred<V>
const pendingResults = new WeakMap<DehydratedAtomValue, PendingDeferred>()

const dehydrateOptions = ['encodeInitialAs'] as const

/**
 * Encodes the serializable atoms currently stored in a registry into dehydrated
 * state.
 *
 * **Details**
 *
 * Only atoms marked with `Atom.serializable` are included. `encodeInitialAs`
 * controls whether `AsyncResult.Initial` values are ignored, encoded as values,
 * or carried as a pending update that completes when the atom leaves the
 * initial state.
 *
 * @since 4.0.0
 */
export const dehydrate: {
  (options?: {
    /**
     * How to encode `AsyncResult.Initial` values. Default is "ignore".
     */
    readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
  }): (registry: AtomRegistry.Registry) => DehydratedAtomValue[]
  (
    registry: AtomRegistry.Registry,
    options?: {
      /**
       * How to encode `AsyncResult.Initial` values. Default is "ignore".
       */
      readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
    },
  ): DehydratedAtomValue[]
} = dual(
  (args) => args.length > 1 || !isPlainOptions(dehydrateOptions)(args[0]),
  (
    registry: AtomRegistry.Registry,
    options?: {
      readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
    },
  ): DehydratedAtomValue[] => {
    const encodeInitialResultMode = encodeInitialMode(options)
    const arr: DehydratedAtomValue[] = []
    const now = Effect.runSync(Clock.currentTimeMillis)
    registry.getNodes().forEach((node, key) => {
      dehydrateNode(registry, node, key, encodeInitialResultMode, now, arr)
    })
    return arr
  },
)

const encodeInitialMode = (
  options?: {
    readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
  },
): 'ignore' | 'deferred' | 'value-only' => {
  if (options === undefined) {
    return 'ignore'
  }
  return encodeInitialOrIgnore(options.encodeInitialAs)
}

const encodeInitialOrIgnore = (
  mode: 'ignore' | 'deferred' | 'value-only' | undefined,
): 'ignore' | 'deferred' | 'value-only' => {
  if (mode === undefined) {
    return 'ignore'
  }
  return mode
}

const isInitialResult = <V = unknown>(value: V): boolean => {
  if (!AsyncResult.isAsyncResult(value)) {
    return false
  }
  return AsyncResult.isInitial(value)
}

const dehydrateNode = (
  registry: AtomRegistry.Registry,
  node: { readonly atom: AnyAtom; readonly value: () => AnyValue },
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  if (!Atom.isSerializable(node.atom)) {
    return
  }
  dehydrateSerializable(
    registry,
    node.atom,
    node.atom[Atom.SerializableTypeId],
    node.value(),
    key,
    encodeInitialResultMode,
    now,
    arr,
  )
}

const shouldSkipInitial = (
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
): boolean => {
  if (encodeInitialResultMode !== 'ignore') {
    return false
  }
  return isInitial
}

const dehydrateSerializable = (
  registry: AtomRegistry.Registry,
  atom: AnyAtom,
  serializer: { readonly encode: <V = unknown>(value: V) => Atom.SerializableJson },
  value: AnyValue,
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  const isInitial = isInitialResult(value)
  if (shouldSkipInitial(encodeInitialResultMode, isInitial)) {
    return
  }
  dehydrateKeyed(registry, atom, serializer, value, key, encodeInitialResultMode, isInitial, now, arr)
}

const dehydrateKeyed = (
  registry: AtomRegistry.Registry,
  atom: AnyAtom,
  serializer: { readonly encode: <V = unknown>(value: V) => Atom.SerializableJson },
  value: AnyValue,
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  if (typeof key !== 'string') {
    return
  }
  const entry: DehydratedAtomValue = {
    '~effect/reactivity/DehydratedAtom': true,
    key,
    value: serializer.encode(value),
    dehydratedAt: now,
  }
  attachDeferred(registry, atom, serializer, entry, encodeInitialResultMode, isInitial)
  arr.push(entry)
}

const shouldAttachDeferred = (
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
): boolean => {
  if (encodeInitialResultMode !== 'deferred') {
    return false
  }
  return isInitial
}

const isSettledResult = <V = unknown>(newValue: V): boolean => {
  if (!AsyncResult.isAsyncResult(newValue)) {
    return false
  }
  return !AsyncResult.isInitial(newValue)
}

const attachDeferred = (
  registry: AtomRegistry.Registry,
  atom: AnyAtom,
  serializer: { readonly encode: <V = unknown>(value: V) => Atom.SerializableJson },
  entry: DehydratedAtomValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
): void => {
  if (!shouldAttachDeferred(encodeInitialResultMode, isInitial)) {
    return
  }
  const deferred = Deferred.makeUnsafe<AnyValue>()
  const unsubscribe = registry.subscribe(atom, (newValue) => {
    completeDeferred(deferred, unsubscribe, serializer, newValue)
  })
  pendingResults.set(entry, deferred)
}

const completeDeferred = (
  deferred: Deferred.Deferred<AnyValue>,
  unsubscribe: () => void,
  serializer: { readonly encode: <V = unknown>(value: V) => Atom.SerializableJson },
  newValue: AnyValue,
): void => {
  if (!isSettledResult(newValue)) {
    return
  }
  Deferred.doneUnsafe(deferred, Effect.succeed(serializer.encode(newValue)))
  unsubscribe()
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
 * Encoded values are preloaded by serialization key. Entries whose initial
 * state was carried as pending (see `dehydrate`'s `encodeInitialAs`) update the
 * matching registry node, or preload the resolved value, when that pending
 * value completes.
 *
 * Returns a fiber that completes once every pending update has been applied to
 * the registry. Callers that need the state fully settled — tests, SSR flushes
 * — can join it; fire-and-forget callers can ignore it.
 *
 * @since 4.0.0
 */
export const hydrate: {
  (
    dehydratedState: Iterable<DehydratedAtomValue>,
  ): (registry: AtomRegistry.Registry) => Fiber.Fiber<void, never>
  (
    registry: AtomRegistry.Registry,
    dehydratedState: Iterable<DehydratedAtomValue>,
  ): Fiber.Fiber<void, never>
} = dual(
  2,
  (
    registry: AtomRegistry.Registry,
    dehydratedState: Iterable<DehydratedAtomValue>,
  ): Fiber.Fiber<void, never> => {
    const pending: Effect.Effect<void>[] = []
    for (const datom of dehydratedState) {
      hydrateOne(registry, pending, datom)
    }
    return Effect.runFork(Effect.forEach(pending, (effect) => effect, { discard: true }))
  },
)

const hydrateOne = (
  registry: AtomRegistry.Registry,
  pending: Effect.Effect<void>[],
  datom: DehydratedAtomValue,
): void => {
  registry.setSerializable(datom.key, datom.value)
  const result = pendingResults.get(datom)
  if (result === undefined) {
    return
  }
  pending.push(
    Effect.flatMap(Deferred.await(result), (resolvedValue) =>
      Effect.sync(() => {
        registry.setSerializable(datom.key, resolvedValue)
      })),
  )
}
