/**
 * The hydration vocabulary: the dehydrated entry shapes and the pure decisions
 * that encode a registry's serializable atoms and decode an incoming payload.
 *
 * `dehydrate` and `hydrate` themselves live in `./registry.handle.js`: they walk
 * live registry nodes, read deferreds and record refusals. This file declares the
 * data they carry and every choice over it that needs no registry.
 *
 * @since 4.0.0
 */
import type * as Exit from 'effect/Exit'
import { dual } from 'effect/Function'
import * as Schema from 'effect/Schema'
import { isAsyncResult, isInitial } from './async-result.schema.js'
import type * as Atom from './atom.blueprint.js'
import { DehydratedAtomValue as DehydratedAtomValueSchema } from './dehydrated-atom.schema.js'

type AnyValue<A = unknown> = A

type EncodingCodec = Schema.ConstraintEncoder<AnyValue>

type SerializerSpec = Atom.SerializableSpec

/** How a registry carries an `Initial` async result at dehydration time. */
export type EncodeInitialAs = 'ignore' | 'deferred' | 'value-only'

type EncodeInitialOptions = {
  readonly encodeInitialAs?: EncodeInitialAs | undefined
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

const isEncodingCodec = (value: unknown): value is EncodingCodec => Schema.isSchema(value)

/**
 * Reads the JSON codec a serializable atom encodes its value through, when it
 * carries one.
 *
 * @since 4.0.0
 */
export const encodingCodecOf = (serializer: SerializerSpec): EncodingCodec | undefined => {
  const codec = serializer.codecJson
  if (isEncodingCodec(codec) === false) {
    return undefined
  }
  return codec
}

/**
 * Defaults the `encodeInitialAs` option to `"ignore"`.
 *
 * @since 4.0.0
 */
export const encodeInitialMode = (options?: EncodeInitialOptions): EncodeInitialAs => {
  if (options === undefined) {
    return 'ignore'
  }
  return encodeInitialOrIgnore(options.encodeInitialAs)
}

const encodeInitialOrIgnore = (mode: EncodeInitialAs | undefined): EncodeInitialAs => {
  if (mode === undefined) {
    return 'ignore'
  }
  return mode
}

/**
 * Decides whether an initial value is dropped from the dehydrated state.
 *
 * @since 4.0.0
 */
export const shouldSkipInitial: {
  (mode: EncodeInitialAs, isInitial: boolean): boolean
  (isInitial: boolean): (mode: EncodeInitialAs) => boolean
} = dual(2, (mode: EncodeInitialAs, isInitial: boolean): boolean => {
  if (mode !== 'ignore') {
    return false
  }
  return isInitial
})

/**
 * Decides whether an initial value is carried as a pending update.
 *
 * @since 4.0.0
 */
export const shouldAttachDeferred: {
  (mode: EncodeInitialAs, isInitial: boolean): boolean
  (isInitial: boolean): (mode: EncodeInitialAs) => boolean
} = dual(2, (mode: EncodeInitialAs, isInitial: boolean): boolean => {
  if (mode !== 'deferred') {
    return false
  }
  return isInitial
})

/**
 * Reports whether an atom value is an unsettled `AsyncResult`.
 *
 * @since 4.0.0
 */
export const isInitialResult = (value: AnyValue): boolean => {
  if (isAsyncResult(value) === false) {
    return false
  }
  return isInitial(value)
}

/**
 * Reports whether an atom value is a settled `AsyncResult`.
 *
 * @since 4.0.0
 */
export const isSettledResult = (value: AnyValue): boolean => {
  if (isAsyncResult(value) === false) {
    return false
  }
  return isInitial(value) === false
}

/**
 * Encodes a value through a serializable atom's codec, as plain data.
 *
 * @since 4.0.0
 */
export const encodeHydrationValue: {
  (codec: EncodingCodec, value: AnyValue): Exit.Exit<AnyValue, Schema.SchemaError>
  (value: AnyValue): (codec: EncodingCodec) => Exit.Exit<AnyValue, Schema.SchemaError>
} = dual(
  2,
  (codec: EncodingCodec, value: AnyValue): Exit.Exit<AnyValue, Schema.SchemaError> =>
    Schema.encodeUnknownExit(codec)(value),
)

/**
 * Decodes one incoming hydration entry, as plain data.
 *
 * @since 4.0.0
 */
export const decodeHydrationEntry = (
  entry: HydrationEntry,
): Exit.Exit<DehydratedAtomValue, Schema.SchemaError> => Schema.decodeUnknownExit(DehydratedAtomValueSchema)(entry)
