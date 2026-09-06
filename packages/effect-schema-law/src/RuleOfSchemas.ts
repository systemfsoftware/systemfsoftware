import { it } from '@effect/vitest'
import { Exit, Schema, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

/**
 * The two laws, as decisions over one schema's own values.
 *
 * Both share a single compiled codec pair and both equivalences: a schema is
 * compiled once per `ruleOfSchemas` call, never once per law and never per
 * generated draw.
 */
const lawsOf = <A, I>(schema: S.Codec<A, I>): {
  /**
   * `∀x. enc(dec(enc(x))) === enc(x)` — a canonical encoded form survives a
   * decode-then-encode round-trip unchanged.
   *
   * Quantified over the type side, so the encoded values it judges are exactly
   * the image of `encode` — the canonical ones. A schema that rewrites a
   * non-canonical encoded input, trimming a padded string say, does not break
   * this law and is not meant to.
   */
  readonly encodeStable: (value: A) => boolean
  /** `∀x. dec(enc(x)) === x` — round-trip identity, by the schema's type equivalence. */
  readonly roundTrips: (value: A) => boolean
} => {
  const decodeExit = Schema.decodeExit(schema)
  const encodeSync = Schema.encodeSync(schema)
  const typeEq = S.toEquivalence(schema)
  const encodedEq = S.toEquivalence(S.toEncoded(schema))

  return {
    encodeStable: (value) => {
      const encoded = encodeSync(value)
      const result = decodeExit(encoded)
      if (Exit.isFailure(result)) return false
      return encodedEq(encodeSync(result.value), encoded)
    },
    roundTrips: (value) => {
      const result = decodeExit(encodeSync(value))
      return Exit.isSuccess(result) && typeEq(result.value, value)
    },
  }
}

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
  const { encodeStable, roundTrips } = lawsOf(schema)
  const arbitrary = S.toArbitrary(schema)(fc)

  it.prop(`∀x_${name}Enc_=x`, [arbitrary], ([value]) => encodeStable(value))

  it.prop(`∀x_${name}_=x`, [arbitrary], ([value]) => roundTrips(value))
}
