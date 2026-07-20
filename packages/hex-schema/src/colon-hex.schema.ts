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
