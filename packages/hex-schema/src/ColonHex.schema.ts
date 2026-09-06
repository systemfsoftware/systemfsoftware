import { Schema as S, SchemaTransformation } from 'effect'
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
