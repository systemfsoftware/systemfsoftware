import { Schema } from 'effect'

export type Raw = (typeof Schema.Unknown)['Type']
export type RawObject = Readonly<Record<string, Raw>>

export const asRawObject = (value: Raw): RawObject | undefined =>
  Schema.is(Schema.Record(Schema.String, Schema.Unknown))(value) ? value : undefined
