import { Option, Schema } from 'effect'
import * as Arr from 'effect/Array'
import { RawValue } from './captured-response.schema.js'

/** A JSON-path lookup over one value. */
export interface PathLookup {
  readonly value: RawValue
  readonly path: ReadonlyArray<string>
}

const step = (value: RawValue, key: string): Option.Option<RawValue> =>
  Option.flatMap(
    Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value),
    (record) => Option.fromUndefinedOr(record[key]),
  )

/** The value at a JSON path, or `Option.none` when any segment is absent. */
export const atPath = ({ value, path }: PathLookup): Option.Option<RawValue> =>
  Arr.reduce(path, Option.some(value), (current, key) => Option.flatMap(current, (segment) => step(segment, key)))
