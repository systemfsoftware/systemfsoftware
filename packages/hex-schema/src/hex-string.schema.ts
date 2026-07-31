/// <reference types="vitest/import-meta" />
import { pipe, Schema as S } from 'effect'
import { StrictHex } from './strict-hex.schema.js'

const toStrictHex = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase()

export const HexString = pipe(
  S.transform(
    S.String.pipe(
      S.pattern(/^(0x)?[0-9a-fA-F]*$/),
      S.annotations({
        arbitrary: () => (fc) => fc.stringMatching(/^(0x)?[0-9a-fA-F]*$/),
        identifier: 'HexStringInput',
        description: 'A hex string, optionally prefixed with 0x (empty string allowed)',
      }),
    ),
    StrictHex,
    {
      decode: toStrictHex,
      encode: (s) => s,
    },
  ),
  S.annotations({
    identifier: 'HexString',
    description: 'A string representing hexadecimal data, with or without the 0x prefix',
    title: 'Hex String',
  }),
  S.brand('HexString'),
)

export type HexString = S.Schema.Type<typeof HexString>

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect')

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
    [fc.stringMatching(/^[0-9a-fA-F]*[A-F][0-9a-fA-F]*$/)],
    ([body]) => toStrictHex(`0x${body}`) === body.toLowerCase(),
  )
}
