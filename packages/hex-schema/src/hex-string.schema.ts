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
  const { describe, expect, it } = await import('@effect/vitest')

  /**
   * Unreachable from the generated `ruleOfSchemas` pair: it draws from
   * `HexString`'s type side and `encode` is identity, so every value that
   * reaches `decode` is already unprefixed lowercase. Neither the strip nor
   * the lowercasing is exercised there.
   */
  describe('toStrictHex', () => {
    it('Should_StripPrefixAndLowercase_When_InputIsPrefixedUppercase', () => {
      expect(toStrictHex('0xABCD')).toBe('abcd')
    })

    it('Should_Lowercase_When_InputIsUnprefixed', () => {
      expect(toStrictHex('AbCd')).toBe('abcd')
    })

    it('Should_ReturnInputUnchanged_When_InputIsAlreadyStrict', () => {
      expect(toStrictHex('abcd')).toBe('abcd')
    })
  })
}
