import { Encoding, pipe, Schema as S } from 'effect'
import { HexBytes } from './hex-bytes.schema.js'

export const Uint8ArrayFromPrefixedHex = pipe(
  S.transform(
    S.String.pipe(
      S.pattern(/^0x(?:[0-9a-f]{2})*$/),
      S.annotations({ arbitrary: () => (fc) => fc.uint8Array().map((bytes) => `0x${Encoding.encodeHex(bytes)}`) }),
    ),
    HexBytes,
    {
      strict: true,
      decode: (prefixed) => prefixed.slice(2),
      encode: (hex) => `0x${hex}`,
    },
  ),
  S.annotations({
    identifier: 'Uint8ArrayFromPrefixedHex',
    description: 'Uint8Array encoded as a 0x-prefixed hex string',
    title: 'Uint8Array from Prefixed Hex',
  }),
)

export type Uint8ArrayFromPrefixedHex = S.Schema.Type<typeof Uint8ArrayFromPrefixedHex>
