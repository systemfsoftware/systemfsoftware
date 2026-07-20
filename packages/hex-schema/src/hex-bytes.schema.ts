import { Schema as S } from 'effect'

/**
 * Composable hex-to-bytes schema. Compose any branded hex schema with
 * this to produce a `Uint8Array` from that format:
 *
 * ```ts
 * S.compose(PrefixedHex, HexBytes)  // Schema<Uint8Array, string>
 * S.compose(ColonHex, HexBytes)     // Schema<Uint8Array, string>
 * ```
 */
export const HexBytes = S.Uint8ArrayFromHex.pipe(
  S.annotations({
    identifier: 'HexBytes',
    description: 'Uint8Array encoded as a lowercase hex string — compose with any hex schema',
    title: 'Hex Bytes',
  }),
)
