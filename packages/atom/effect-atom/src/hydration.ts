/**
 * Saves and restores serializable atom state.
 *
 * `dehydrate` reads atoms marked with `Atom.serializable` from a
 * registry and returns encoded entries keyed by their serialization keys.
 * `hydrate` preloads those entries into another registry before the atoms are
 * read. Initial `AsyncResult` values can be ignored, encoded as values, or
 * carried as a pending update that settles the target registry once the source
 * atom leaves the initial state.
 *
 * @since 4.0.0
 */
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import type * as Fiber from 'effect/Fiber'
import { constVoid, dual } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as AsyncResult from './async-result.js'
import { isSerializable } from './atom.blueprint.js'
import type * as Atom from './atom.blueprint.js'
import { DehydratedAtomValue as DehydratedAtomValueSchema } from './dehydrated-atom.schema.js'
import * as Registry from './registry.handle.js'

type AnyAtom<A = unknown> = Atom.Atom<A>
type AnyValue<A = unknown> = A

const isEncodingCodec = (u: unknown): u is Schema.ConstraintEncoder<AnyValue> => Schema.isSchema(u)

const encodingCodecOf = (serializer: Atom.SerializableSpec): Schema.ConstraintEncoder<AnyValue> | undefined => {
  const codec = serializer.codecJson
  if (isEncodingCodec(codec) === false) {
    return undefined
  }
  return codec
}

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
 * One entry of a hydration payload as received from outside the process: the
 * in-process `DehydratedAtomValue` returned by `dehydrate`, or any JSON value
 * parsed from a transport. Every entry is decoded before it reaches the
 * registry; entries that fail to decode are recorded as refusals.
 *
 * @since 4.0.0
 */
export type HydrationEntry = DehydratedAtomValue | Schema.Json

const pendingResultSlot: unique symbol = Symbol('~effect-atom/Hydration/pendingResult')

const readPendingResult = (entry: HydrationEntry): Option.Option<Deferred.Deferred<AnyValue>> =>
  Option.some(entry).pipe(
    Option.filter(Predicate.hasProperty(pendingResultSlot)),
    Option.map((withSlot) => withSlot[pendingResultSlot]),
    Option.filter(Deferred.isDeferred<AnyValue, never>),
  )

const writePendingResult = (entry: DehydratedAtomValue, deferred: Deferred.Deferred<AnyValue>): void => {
  Object.defineProperty(entry, pendingResultSlot, {
    value: deferred,
    enumerable: false,
    configurable: true,
    writable: false,
  })
}

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
  }): (registry: Registry.Registry) => DehydratedAtomValue[]
  (
    registry: Registry.Registry,
    options?: {
      /**
       * How to encode `AsyncResult.Initial` values. Default is "ignore".
       */
      readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
    },
  ): DehydratedAtomValue[]
} = dual(
  (args) => Registry.isRegistry(args[0]),
  (
    registry: Registry.Registry,
    options?: {
      readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
    },
  ): DehydratedAtomValue[] => {
    const encodeInitialResultMode = encodeInitialMode(options)
    const arr: DehydratedAtomValue[] = []
    const now = Effect.runSync(Clock.currentTimeMillis)
    Registry.getNodes(registry).forEach((node, key) => {
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
  registry: Registry.Registry,
  node: { readonly atom: AnyAtom; readonly value: () => AnyValue },
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  if (isSerializable(node.atom) === false) {
    return
  }
  dehydrateSerializable(
    registry,
    node.atom,
    node.atom.spec.serializable,
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

type Serializer = Atom.SerializableSpec

const dehydrateSerializable = (
  registry: Registry.Registry,
  atom: AnyAtom,
  serializer: Serializer,
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

const encodeOrRefuse = (
  registry: Registry.Registry,
  serializer: Serializer,
  value: AnyValue,
): Option.Option<AnyValue> => {
  const codec = encodingCodecOf(serializer)
  if (codec === undefined) {
    return Option.none()
  }
  return encodeWithCodec(registry, serializer.key, codec, value)
}

const encodeWithCodec = (
  registry: Registry.Registry,
  key: string,
  codec: Schema.ConstraintEncoder<AnyValue>,
  value: AnyValue,
): Option.Option<AnyValue> => {
  const exit = Schema.encodeUnknownExit(codec)(value)
  if (Exit.isSuccess(exit)) {
    return Option.some(exit.value)
  }
  refuseEncode(registry, key, exit.cause)
  return Option.none()
}

const refuseEncode = (registry: Registry.Registry, key: string, cause: Cause.Cause<Schema.SchemaError>): void => {
  const issue = Option.match(Cause.findErrorOption(cause), {
    onNone: () => 'value could not be encoded',
    onSome: (error) => error.message,
  })
  Registry.recordRefusal(registry, { key, issue })
}

const dehydrateKeyed = (
  registry: Registry.Registry,
  atom: AnyAtom,
  serializer: Serializer,
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
  Option.match(encodeOrRefuse(registry, serializer, value), {
    onNone: constVoid,
    onSome: (encoded) => {
      const entry: DehydratedAtomValue = {
        '~effect/reactivity/DehydratedAtom': true,
        key,
        value: encoded,
        dehydratedAt: now,
      }
      attachDeferred(registry, atom, serializer, entry, encodeInitialResultMode, isInitial)
      arr.push(entry)
    },
  })
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
  registry: Registry.Registry,
  atom: AnyAtom,
  serializer: Serializer,
  entry: DehydratedAtomValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
): void => {
  if (!shouldAttachDeferred(encodeInitialResultMode, isInitial)) {
    return
  }
  const deferred = Deferred.makeUnsafe<AnyValue>()
  const unsubscribe = Registry.subscribe(registry, atom, (newValue) => {
    completeDeferred(registry, deferred, unsubscribe, serializer, newValue)
  })
  writePendingResult(entry, deferred)
}

const completeDeferred = (
  registry: Registry.Registry,
  deferred: Deferred.Deferred<AnyValue>,
  unsubscribe: () => void,
  serializer: Serializer,
  newValue: AnyValue,
): void => {
  if (!isSettledResult(newValue)) {
    return
  }
  unsubscribe()
  Deferred.doneUnsafe(
    deferred,
    Option.match(encodeOrRefuse(registry, serializer, newValue), {
      onNone: () => Effect.interrupt,
      onSome: Effect.succeed,
    }),
  )
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
  (dehydratedState: Iterable<HydrationEntry>): (registry: Registry.Registry) => Fiber.Fiber<void, never>
  (registry: Registry.Registry, dehydratedState: Iterable<HydrationEntry>): Fiber.Fiber<void, never>
} = dual(
  2,
  (registry: Registry.Registry, dehydratedState: Iterable<HydrationEntry>): Fiber.Fiber<void, never> => {
    const pending: Effect.Effect<void>[] = []
    for (const entry of dehydratedState) {
      hydrateOne(registry, pending, entry)
    }
    return Effect.runFork(Effect.forEach(pending, (effect) => effect, { discard: true }))
  },
)

const refuseMalformedEntry = (
  registry: Registry.Registry,
  cause: Cause.Cause<Schema.SchemaError>,
): void => {
  const found = Cause.findErrorOption(cause)
  const issue = Option.match(found, {
    onNone: () => 'entry is not a dehydrated atom value',
    onSome: (error) => error.message,
  })
  Registry.recordRefusal(registry, { key: undefined, issue })
}

const queuePendingResult = (
  registry: Registry.Registry,
  pending: Effect.Effect<void>[],
  datom: DehydratedAtomValue,
  result: Deferred.Deferred<AnyValue>,
): void => {
  pending.push(
    Deferred.await(result).pipe(
      Effect.exit,
      Effect.map(Exit.match({
        onFailure: constVoid,
        onSuccess: (resolvedValue) => Registry.setSerializable(registry, datom.key, resolvedValue),
      })),
    ),
  )
}

const applyDecodedEntry = (
  registry: Registry.Registry,
  pending: Effect.Effect<void>[],
  datom: DehydratedAtomValue,
  entry: HydrationEntry,
): void => {
  Registry.setSerializable(registry, datom.key, datom.value)
  Option.match(readPendingResult(entry), {
    onNone: constVoid,
    onSome: (result) => queuePendingResult(registry, pending, datom, result),
  })
}

const hydrateOne = (
  registry: Registry.Registry,
  pending: Effect.Effect<void>[],
  entry: HydrationEntry,
): void => {
  const exit = Schema.decodeUnknownExit(DehydratedAtomValueSchema)(entry)
  if (Exit.isSuccess(exit)) {
    applyDecodedEntry(registry, pending, exit.value, entry)
    return
  }
  refuseMalformedEntry(registry, exit.cause)
}
