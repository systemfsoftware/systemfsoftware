import { it } from '@effect/vitest'
import { Function, Option, Schema, Schema as S } from 'effect'

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
  const decodeOption = Schema.decodeOption(schema)
  const encodeOption = Schema.encodeOption(schema)
  const typeEq = S.toEquivalence(schema)
  const encodedEq = S.toEquivalence(S.toEncoded(schema))

  const encodeStable = (value: A): boolean =>
    encodeOption(value).pipe(
      Option.flatMap(decodeOption),
      Option.flatMap(encodeOption),
      Option.match({
        onNone: () => false,
        onSome: (enc) =>
          encodeOption(value).pipe(
            Option.match({
              onNone: () => false,
              onSome: (orig) => encodedEq(enc, orig),
            }),
          ),
      }),
    )

  const roundTrips = (value: A): boolean =>
    encodeOption(value).pipe(
      Option.flatMap(decodeOption),
      Option.match({
        onNone: () => false,
        onSome: (dec) => typeEq(dec, value),
      }),
    )

  return { encodeStable, roundTrips }
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
export const ruleOfSchemas: {
  (name: string): <A, I>(schema: S.Codec<A, I>) => void
  <A, I>(name: string, schema: S.Codec<A, I>): void
} = Function.dual(
  2,
  <A, I>(
    name: string,
    schema: S.Codec<A, I>,
  ): void => {
    const { encodeStable, roundTrips } = lawsOf(schema)
    const options = { arbitrary: { runs: 100 } }
    it.prop(`∀x_${name}Enc_=x`, [schema], ([value]) => encodeStable(value), options)

    it.prop(`∀x_${name}_=x`, [schema], ([value]) => roundTrips(value), options)
  },
)
