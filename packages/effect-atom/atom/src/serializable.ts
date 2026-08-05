import type * as Schema from 'effect/Schema'

/**
 * @since 1.0.0
 * @category Serializable
 */
export const SerializableTypeId: SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * @since 1.0.0
 * @category Serializable
 */
export type SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * @since 1.0.0
 * @category Serializable
 */
export interface Serializable<S extends Schema.Schema.Any> {
  readonly [SerializableTypeId]: {
    readonly key: string
    readonly encode: (value: S['Type']) => S['Encoded']
    readonly decode: (value: S['Encoded']) => S['Type']
  }
}

/**
 * @since 1.0.0
 * @category Serializable
 */
export const isSerializable = <A extends object>(self: A): self is A & Serializable<any> => SerializableTypeId in self
