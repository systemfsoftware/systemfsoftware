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
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect')

  /**
   * The one law the generated `ruleOfSchemas` pair cannot state. `ColonHex`'s
   * arbitrary is `fc.hexaString().map(hexToColon)` and its `encode` is
   * `hexToColon`, so the function sits on both sides of the round-trip and any
   * bug in it cancels out — deleting `.toUpperCase()` leaves both generated
   * laws green at 500/500 while the schema emits lowercase against its own
   * "uppercase hex bytes" contract.
   *
   * Grouping and the empty-string guard are not stated here; the laws kill
   * every mutant of those. The generator forces at least one letter, so the
   * uppercase clause is decidable on every draw rather than merely likely.
   */
  it.prop(
    '∀h_HexToColon_=UpperOfInput',
    [fc.stringMatching(/^[0-9a-f]*[a-f][0-9a-f]*$/)],
    ([hex]) => hexToColon(hex).replaceAll(':', '') === hex.toUpperCase(),
  )
}
