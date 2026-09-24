import { dual } from 'effect/Function'
import * as Schema from 'effect/Schema'
import { stackLabel } from './atom-combinators.resource.js'
import { type Atom, copyAtomWithProto, type Top } from './atom.resource.js'

function serializableLabel(self: Atom<Top>, key: string): readonly [string, string] {
  if (self.label === undefined) {
    return [key, stackLabel()]
  }
  return self.label
}

// -----------------------------------------------------------------------------
// constructors
// -----------------------------------------------------------------------------

/**
 * The type id used to mark atoms that carry serialization metadata.
 *
 * @since 4.0.0
 */
export const SerializableTypeId: SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * The literal type of the serializable atom marker.
 *
 * @since 4.0.0
 */
export type SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * Serialization metadata attached to an atom.
 *
 * **Details**
 *
 * The key identifies the atom in dehydrated state, and the encode/decode
 * functions convert between the atom value and the schema encoded value.
 *
 * @since 4.0.0
 */
export type SerializableJson =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<SerializableJson>
  | { readonly [key: string]: SerializableJson }

export interface Serializable<S extends Schema.Constraint> {
  readonly [SerializableTypeId]: {
    readonly key: string
    readonly codecJson: Schema.toCodecJson<S>
  }
}

/**
 * Returns `true` when an atom carries `Serializable` metadata.
 *
 * @since 4.0.0
 */
export const isSerializable = (self: Atom<unknown>): self is Atom<Top> & Serializable<Schema.Unknown> =>
  SerializableTypeId in self

/**
 * Attaches serialization metadata to an atom using a schema and stable key.
 *
 * **Details**
 *
 * The schema is converted to a JSON codec used to encode values when a
 * registry is dehydrated and to decode them when one is hydrated; values that
 * fail either direction are recorded as refusals on the registry.
 *
 * @since 4.0.0
 */
export const serializable: {
  <R extends Atom<Top>, S extends Schema.Constraint>(options: {
    readonly key: string
    readonly schema: S
  }): (self: R) => R & Serializable<S>
  <R extends Atom<Top>, S extends Schema.Constraint>(self: R, options: {
    readonly key: string
    readonly schema: S
  }): R & Serializable<S>
} = dual(2, <R extends Atom<Top>, A, I>(self: R, options: {
  readonly key: string
  readonly schema: Schema.ConstraintCodec<A, I>
}): R & Serializable<Schema.ConstraintCodec<A, I>> => {
  const codecJson = Schema.toCodecJson(options.schema)
  return copyAtomWithProto(self, {
    label: serializableLabel(self, options.key),
    [SerializableTypeId]: {
      key: options.key,
      codecJson,
    },
  })
})
