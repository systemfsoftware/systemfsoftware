import { Arbitrary, Effect, Option, Schema } from 'effect'
import * as fc from 'fast-check'
import type { InputSchema } from '../Contract/contract.js'

const boundarySeeds: ReadonlyArray<Schema.Json> = [
  -1,
  0,
  Number.MAX_SAFE_INTEGER,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  '',
  null,
  {},
  [],
]

const sampledJson = <A>(arbitrary: Arbitrary.Arbitrary<A>, seed: number): Schema.Json =>
  Option.getOrThrowWith(
    Schema.decodeUnknownOption(Schema.Json)(
      Effect.runSync(Effect.orDie(Arbitrary.sampleEffect(arbitrary, { count: 1, seed })))[0],
    ),
    () => new Error(`the schema's encoded side generated a value outside Schema.Json for seed ${seed}`),
  )

export const validInputs = (input: InputSchema): fc.Arbitrary<Schema.Json> => {
  const encoded = Arbitrary.schema(Schema.toEncoded(input))
  return fc.nat().map((seed) => sampledJson(encoded, seed))
}

const fieldsOf = (keys: ReadonlyArray<string>, value: Schema.Json): Schema.JsonObject =>
  Object.fromEntries(keys.map((key): readonly [string, Schema.Json] => [key, value]))

const withoutField = (keys: ReadonlyArray<string>, omitted: string): Schema.JsonObject =>
  fieldsOf(keys.filter((key) => key !== omitted), 0)

const shapesOf = (keys: ReadonlyArray<string>): ReadonlyArray<fc.Arbitrary<Schema.Json>> => [
  fc.constantFrom(...boundarySeeds),
  fc.constant<Schema.Json>({}),
  ...keys.map((omitted) => fc.constant<Schema.Json>(withoutField(keys, omitted))),
  ...keys.map((key) => fc.constantFrom(...boundarySeeds.map((value): Schema.Json => ({ [key]: value })))),
  fc.constantFrom(...boundarySeeds.map((value): Schema.Json => fieldsOf([...keys, '__excess'], value))),
]

export const invalidEncodings = (input: InputSchema): fc.Arbitrary<Schema.Json> =>
  fc.oneof(...shapesOf(Object.keys(input.fields)))
