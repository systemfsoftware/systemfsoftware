import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

import { JsonScalarFromString } from './json-scalar.schema.js'

const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|[{}[\]:,]|[^"{}[\]:,\s]+/gu

type JsonEntry = readonly [string, Schema.Json]

interface Parsed {
  readonly value: Schema.Json
  readonly next: number
}

const decodeScalar = Schema.decodeUnknownOption(JsonScalarFromString)

const tokensOf = (text: string): ReadonlyArray<string> =>
  Arr.map(Arr.fromIterable(text.matchAll(JSON_TOKEN)), (match) => match[0])

const tokenAt = (tokens: ReadonlyArray<string>, index: number): string =>
  Option.getOrElse(Arr.get(tokens, index), () => '')

const parsedOf = (value: Schema.Json, next: number): Parsed => ({ value, next })

const entryOf = (key: string, value: Schema.Json): JsonEntry => [key, value]

const scalarAt = (tokens: ReadonlyArray<string>, index: number): Option.Option<Parsed> =>
  Option.map(decodeScalar(tokenAt(tokens, index)), (value) => parsedOf(value, index + 1))

const keyAt = (tokens: ReadonlyArray<string>, index: number): Option.Option<string> =>
  Option.filter(decodeScalar(tokenAt(tokens, index)), Predicate.isString)

const valueAt = (tokens: ReadonlyArray<string>, index: number): Option.Option<Parsed> =>
  Match.value(tokenAt(tokens, index)).pipe(
    Match.when('{', () => membersAt(tokens, index + 1, [])),
    Match.when('[', () => elementsAt(tokens, index + 1, [])),
    Match.orElse(() => scalarAt(tokens, index)),
  )

const memberAt = (
  tokens: ReadonlyArray<string>,
  index: number,
  entries: ReadonlyArray<JsonEntry>,
): Option.Option<Parsed> =>
  Option.all({ key: keyAt(tokens, index), member: valueAt(tokens, index + 2) }).pipe(
    Option.flatMap(({ key, member }) =>
      membersAt(tokens, member.next, Arr.append(entries, entryOf(key, member.value)))
    ),
  )

const membersAt = (
  tokens: ReadonlyArray<string>,
  index: number,
  entries: ReadonlyArray<JsonEntry>,
): Option.Option<Parsed> =>
  Match.value(tokenAt(tokens, index)).pipe(
    Match.when('}', () => Option.some(parsedOf(Object.fromEntries(entries), index + 1))),
    Match.when(',', () => membersAt(tokens, index + 1, entries)),
    Match.orElse(() => memberAt(tokens, index, entries)),
  )

const elementAt = (
  tokens: ReadonlyArray<string>,
  index: number,
  elements: ReadonlyArray<Schema.Json>,
): Option.Option<Parsed> =>
  Option.flatMap(
    valueAt(tokens, index),
    (element) => elementsAt(tokens, element.next, Arr.append(elements, element.value)),
  )

const elementsAt = (
  tokens: ReadonlyArray<string>,
  index: number,
  elements: ReadonlyArray<Schema.Json>,
): Option.Option<Parsed> =>
  Match.value(tokenAt(tokens, index)).pipe(
    Match.when(']', () => Option.some(parsedOf(elements, index + 1))),
    Match.when(',', () => elementsAt(tokens, index + 1, elements)),
    Match.orElse(() => elementAt(tokens, index, elements)),
  )

export const rebuildJson = (text: string): Option.Option<Schema.Json> =>
  Option.map(valueAt(tokensOf(text), 0), (parsed) => parsed.value)
