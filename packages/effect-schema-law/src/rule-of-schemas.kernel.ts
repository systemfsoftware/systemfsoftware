import { it } from '@effect/vitest'
import { Either, Schema, Schema as S } from 'effect'

/**
 * Property-test the round-trip and encode-stability laws of any Effect Schema.
 *
 * Registers two fast-check properties with `@effect/vitest`:
 *   1. `∀x. enc(dec(enc(x))) === enc(x)` — encode stability across decode.
 *   2. `∀x. dec(enc(x)) === x` — round-trip identity.
 *
 * Use inside a `describe` block to scope the generated tests.
 */
export const ruleOfSchemas = <A, I>(
  name: string,
  schema: S.Schema<A, I, never>,
): void => {
  const decodeEither = Schema.decodeEither(schema)
  const encodeSync = Schema.encodeSync(schema)
  const typeEq = S.equivalence(schema)
  const encodedEq = S.equivalence(S.encodedSchema(schema))

  it.prop(
    `∀x_${name}Enc_=x`,
    [schema],
    ([value]) => {
      const encoded = encodeSync(value)
      const result = decodeEither(encoded)
      if (Either.isLeft(result)) return false
      const reencoded = encodeSync(result.right)
      return encodedEq(reencoded, encoded)
    },
  )

  it.prop(
    `∀x_${name}_=x`,
    [schema],
    ([value]) => {
      const encoded = encodeSync(value)
      const result = decodeEither(encoded)
      return Either.isRight(result) && typeEq(result.right, value)
    },
  )
}
