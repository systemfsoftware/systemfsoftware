/// <reference types="vitest/import-meta" />
import { type Brand, Schema as S, SchemaTransformation } from 'effect'
import { HexString } from './HexString.schema.js'

const hexToColon = (hex: string): string => (hex.match(/.{1,2}/g) ?? []).map((byte) => byte.toUpperCase()).join(':')

export const ColonHex = S.String.pipe(
  S.check(S.isPattern(/^([0-9A-Fa-f]{1,2}(:[0-9A-Fa-f]{1,2})*)?$/)),
  S.decodeTo(
    S.toEncoded(HexString),
    SchemaTransformation.transform({
      decode: (colon) => colon.replaceAll(':', ''),
      encode: hexToColon,
    }),
  ),
  S.decodeTo(HexString),
  S.annotate({
    identifier: 'ColonHex',
    description: 'Colon-separated uppercase hex bytes — the fingerprint format',
    title: 'Colon-Separated Hex String',
  }),
  S.brand('ColonHex'),
)

export type ColonHex = S.Schema.Type<typeof ColonHex>

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines the vitest collection flag as `undefined`,
  // so this branch is statically dead in the build and never enters the published
  // module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { expectTypeOf } = await import('vitest')

  /**
   * The one law the generated `ruleOfSchemas` pair cannot state: `hexToColon`
   * is the encoder, so it also produces every colon-side value the laws feed
   * back to `decode`. It sits on both sides of the round-trip and any bug in
   * it cancels out — deleting `.toUpperCase()` leaves both generated laws
   * green at 500/500 while the schema emits lowercase against its own
   * "uppercase hex bytes" contract.
   *
   * The generator forces at least one letter, so the uppercase clause is
   * decidable on every draw rather than merely likely. Grouping is blind to
   * the laws for the same reason and is stated separately below.
   */
  it.prop(
    '∀h_HexToColon_=UpperOfInput',
    [fc.stringMatching(/^[0-9a-f]*[a-f][0-9a-f]*$/)],
    ([hex]) => hexToColon(hex).replaceAll(':', '') === hex.toUpperCase(),
  )

  /**
   * The law above strips the colons before comparing, so it cannot see where
   * they fall — chunking one nibble at a time survives it. Bytes rather than
   * nibbles is the whole contract of the format, so it is stated directly.
   */
  it.prop(
    '∀h_HexToColonGrouping_=PairsOfInput',
    [fc.stringMatching(/^(?:[0-9a-f]{2})+$/)],
    ([hex]) => {
      const groups = hexToColon(hex).split(':')
      return groups.length === hex.length / 2 && groups.every((group) => group.length === 2)
    },
  )

  /**
   * The brand exists only in the type, so only a type can state it. `tsc`
   * rejects a false `expectTypeOf`, which is the channel the mutation gate
   * reads — renaming the brand fails the build instead of passing silently.
   */
  expectTypeOf<ColonHex>().toEqualTypeOf<string & Brand.Brand<'HexString'> & Brand.Brand<'ColonHex'>>()
}
