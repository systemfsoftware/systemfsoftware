import { pipe, Schema as S } from 'effect'
import { HexBytes } from './hex-bytes.schema.js'
import { PrefixedHex } from './prefixed-hex.schema.js'

export const Uint8ArrayFromPrefixedHex = pipe(
  S.compose(PrefixedHex, HexBytes),
  S.annotations({
    identifier: 'Uint8ArrayFromPrefixedHex',
    description: 'Uint8Array encoded as a 0x-prefixed hex string',
    title: 'Uint8Array from Prefixed Hex',
  }),
)

export type Uint8ArrayFromPrefixedHex = S.Schema.Type<typeof Uint8ArrayFromPrefixedHex>
