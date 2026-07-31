/// <reference types="vitest/import-meta" />
import { pipe, Schema as S } from 'effect'
import { HexString } from './hex-string.schema.js'

const hexToColon = (hex: string): string => (hex.match(/.{1,2}/g) ?? []).map((byte) => byte.toUpperCase()).join(':')

export const ColonHex = pipe(
  S.compose(
    S.transform(
      S.String.pipe(
        S.pattern(/^([0-9A-Fa-f]{1,2}(:[0-9A-Fa-f]{1,2})*)?$/),
        S.annotations({
          arbitrary: () => (fc) => fc.hexaString().map(hexToColon),
        }),
      ),
      S.encodedSchema(HexString),
      { strict: true, decode: (colon) => colon.replaceAll(':', ''), encode: hexToColon },
    ),
    HexString,
  ),
  S.annotations({
    identifier: 'ColonHex',
    description: 'Colon-separated uppercase hex bytes — the fingerprint format',
    title: 'Colon-Separated Hex String',
  }),
  S.brand('ColonHex'),
)

export type ColonHex = S.Schema.Type<typeof ColonHex>

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, expect, it } = await import('@effect/vitest')

  /**
   * Invisible to the generated `ruleOfSchemas` pair: `ColonHex`'s arbitrary is
   * `fc.hexaString().map(hexToColon)` and its `encode` is `hexToColon`, so the
   * same function sits on both sides of the round-trip and any bug in it
   * cancels out. Dropping `.toUpperCase()` leaves both laws green at 500/500.
   */
  describe('hexToColon', () => {
    it('Should_UppercaseAndGroupIntoBytes_When_LengthIsEven', () => {
      expect(hexToColon('3a14ff')).toBe('3A:14:FF')
    })

    it('Should_EmitLoneTrailingNibble_When_LengthIsOdd', () => {
      expect(hexToColon('abc')).toBe('AB:C')
    })

    it('Should_ReturnEmptyString_When_InputIsEmpty', () => {
      expect(hexToColon('')).toBe('')
    })
  })
}
