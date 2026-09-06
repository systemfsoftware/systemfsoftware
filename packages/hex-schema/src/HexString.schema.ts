/// <reference types="vitest/import-meta" />
import { type Brand, Schema as S, SchemaTransformation } from 'effect'
import { StrictHex } from './StrictHex.schema.js'

const toStrictHex = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase()

export const HexString = S.String.pipe(
  S.annotate({
    identifier: 'HexStringInput',
    description: 'A hex string, optionally prefixed with 0x (empty string allowed)',
  }),
  S.decodeTo(
    StrictHex,
    SchemaTransformation.transform({
      decode: toStrictHex,
      encode: (s) => s,
    }),
  ),
  S.annotate({
    identifier: 'HexString',
    description: 'A string representing hexadecimal data, with or without the 0x prefix',
    title: 'Hex String',
  }),
  S.brand('HexString'),
)

export type HexString = S.Schema.Type<typeof HexString>
const HexWithUppercaseLetter = S.String.pipe(
  S.check(
    S.makeFilter((s) => /^[0-9a-fA-F]*[A-F][0-9a-fA-F]*$/.test(s), {
      arbitrary: {
        candidate: {
          weight: 100,
          make: (fc) => fc.stringMatching(/^[0-9a-fA-F]*[A-F][0-9a-fA-F]*$/),
        },
      },
    }),
  ),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { expectTypeOf } = await import('vitest')

  /**
   * `HexString`'s `encode` is identity, so every value the generated laws feed
   * to `decode` is already unprefixed lowercase — over 300 law inputs, zero
   * start with `0x` and zero carry uppercase. Dropping the strip or mis-sizing
   * the `slice` survives both laws; prefixing is where the function earns its
   * keep, and this states its left inverse.
   *
   * The generator forces at least one uppercase digit so the lowercase clause
   * is decidable on every draw.
   */
  it.prop(
    '∀b_ToStrictHex_=LowerOfBody',
    [S.toArbitrary(HexWithUppercaseLetter)(fc)],
    ([body]) => toStrictHex(`0x${body}`) === body.toLowerCase(),
  )

  /**
   * The wire side states no pattern: `toStrictHex` strips and lowercases, then
   * `StrictHex` decides, and a second pattern would only restate what it
   * already refuses. This is the statement that the alphabet survives the
   * transform.
   *
   * The outsider is the complement of the format's vocabulary. Both exclusions
   * are domain facts: `x` would complete a legal `0x` prefix, and an uppercase
   * hex digit survives `toStrictHex` — this schema is case-insensitive where
   * `StrictHex` is not.
   */
  /**
   * The brand exists only in the type, so only a type can state it. `tsc`
   * rejects a false `expectTypeOf`, which is the channel the mutation gate
   * reads — renaming the brand fails the build instead of passing silently.
   */
  expectTypeOf<HexString>().toEqualTypeOf<string & Brand.Brand<'HexString'>>()
}
