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
export const HexBytes = S.Uint8ArrayFromHex.pipe(
  S.annotate({
    identifier: 'HexBytes',
    description: 'Uint8Array encoded as a lowercase hex string — compose with any hex schema',
    title: 'Hex Bytes',
  }),
)
