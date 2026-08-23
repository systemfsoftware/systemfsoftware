/// <reference types="vitest/import-meta" />
import { Schema as S } from 'effect'
import { HexBytes } from './HexBytes.schema.js'
import { PrefixedHex } from './PrefixedHex.schema.js'

export const Uint8ArrayFromPrefixedHex = S.decodeTo(HexBytes)(PrefixedHex).pipe(
  S.annotate({
    identifier: 'Uint8ArrayFromPrefixedHex',
    description: 'Uint8Array encoded as a 0x-prefixed hex string',
    title: 'Uint8Array from Prefixed Hex',
  }),
)
export type Uint8ArrayFromPrefixedHex = S.Schema.Type<typeof Uint8ArrayFromPrefixedHex>

const decode = S.decodeUnknownExit(Uint8ArrayFromPrefixedHex)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { refutes } = await import('@systemfsoftware/effect-schema-refutation')
  const { Exit } = await import('effect')
  const { expectTypeOf } = await import('vitest')

  const bytePairs = fc.stringMatching(/^(?:[0-9a-f]{2})*$/)
  const nibble = fc.stringMatching(/^[0-9a-f]$/)

  /**
   * The wire form is a *kind* contract, not a weakened one: no loosening of
   * `Uint8ArrayFromPrefixedHex` accepts a `Uint8Array`, so a refusal generator
   * for it can state the rejection half but never a discriminating half. It is
   * stated directly.
   */
  it.prop('∀b_Uint8ArrayFromPrefixedHex_⊥', [fc.uint8Array()], ([bytes]) => !Exit.isSuccess(decode(bytes)))

  refutes(Uint8ArrayFromPrefixedHex, {
    ByteAlignment: fc
      .tuple(bytePairs, nibble)
      .map(([pairs, odd]) => `0x${pairs}${odd}`),
    Uint8PrefixedHexPrefix: fc.stringMatching(/^(?:[0-9a-f]{2})+$/),
    Uint8PrefixedHexCase: fc.stringMatching(/^(?:[A-F]{2})+$/).map((upper) => `0x${upper}`),
  })

  expectTypeOf<S.Codec.Encoded<typeof Uint8ArrayFromPrefixedHex>>().toEqualTypeOf<`0x${string}`>()
}
