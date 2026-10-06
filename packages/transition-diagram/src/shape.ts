import { Option, Schema } from 'effect'

export type Raw = (typeof Schema.Unknown)['Type']
export type RawObject = Readonly<Record<string, Raw>>

export const asRawObject = (value: Raw): RawObject | undefined =>
  Schema.is(Schema.Record(Schema.String, Schema.Unknown))(value) ? value : undefined

export const isRawObject = (value: Raw): value is RawObject => asRawObject(value) !== undefined

export const isObjectLike = (value: Raw): value is object =>
  typeof value === 'object' ? value !== null : typeof value === 'function'

const descriptorValueOf = (descriptor: PropertyDescriptor): Option.Option<Raw> =>
  Option.map(
    Schema.decodeUnknownOption(Schema.Struct({ value: Schema.Unknown }))(descriptor),
    (shaped) => shaped.value,
  )

export const symbolValueOf = (key: symbol) => (value: object): Option.Option<Raw> =>
  Option.flatMap(Option.fromNullishOr(Object.getOwnPropertyDescriptor(value, key)), descriptorValueOf)

export const isNonEmptyString = (value: Raw): value is string => typeof value === 'string' && value.length > 0

export const asNonEmptyString = (value: Raw): string | undefined => isNonEmptyString(value) ? value : undefined

export const detailOf = (cause: Raw): string => cause instanceof Error ? cause.message : 'unknown failure'
