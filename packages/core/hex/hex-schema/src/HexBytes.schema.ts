/// <reference types="vitest/import-meta" />
import { Schema as S } from 'effect'

/**
 * Composable hex-to-bytes schema. Compose any branded hex schema with
 * this to produce a `Uint8Array` from that format:
 *
 * ```ts
 * S.decodeTo(HexBytes)(PrefixedHex)      // Schema<Uint8Array, `0x${string}`>
 * S.decodeTo(HexBytes)(ColonHex)         // Schema<Uint8Array, string>
 * ```
 */
/** @public */
export const HexBytes = S.Uint8ArrayFromHex.pipe(
  S.annotate({
    identifier: 'HexBytes',
    description: 'Uint8Array encoded as a lowercase hex string — compose with any hex schema',
    title: 'Hex Bytes',
  }),
)

const decode = S.decodeUnknownExit(HexBytes)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { Exit } = await import('effect')
  const { expectTypeOf } = await import('vitest')

  /**
   * The wire form is a *kind* contract, not a weakened one: no loosening of
   * `HexBytes` accepts a `Uint8Array`, so a refusal generator for it can state
   * the rejection half but never a discriminating half. It is stated directly.
   */
  it.prop('∀b_HexBytesWireIsString_⊥', [fc.uint8Array()], ([bytes]) => !Exit.isSuccess(decode(bytes)))

  expectTypeOf<S.Codec.Encoded<typeof HexBytes>>().toEqualTypeOf<string>()
}
