import { it } from '@effect/vitest'
import { Exit, Schema, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

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
  schema: S.Codec<A, I>,
): void => {
  const decodeExit = Schema.decodeExit(schema)
  const encodeSync = Schema.encodeSync(schema)
  const typeEq = S.toEquivalence(schema)
  const encodedEq = S.toEquivalence(S.toEncoded(schema))
  const arbitrary = S.toArbitrary(schema)(fc)

  it.prop(
    `∀x_${name}Enc_=x`,
    [arbitrary],
    ([value]) => {
      const encoded = encodeSync(value)
      const result = decodeExit(encoded)
      if (Exit.isFailure(result)) return false
      const reencoded = encodeSync(result.value)
      return encodedEq(reencoded, encoded)
    },
  )

  it.prop(
    `∀x_${name}_=x`,
    [arbitrary],
    ([value]) => {
      const encoded = encodeSync(value)
      const result = decodeExit(encoded)
      return Exit.isSuccess(result) && typeEq(result.value, value)
    },
  )
}
