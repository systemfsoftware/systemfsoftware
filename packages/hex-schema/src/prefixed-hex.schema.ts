import { pipe, Schema as S } from 'effect'
import { StrictHex } from './strict-hex.schema.js'

export const PrefixedHex = pipe(
  S.transform(
    S.TemplateLiteral('0x', S.String),
    StrictHex,
    {
      decode: (fromA) => fromA.slice(2),
      encode: (toI): `0x${string}` => `0x${toI}`,
    },
  ),
  S.annotations({
    identifier: 'PrefixedHex',
    description: 'A 0x-prefixed hex string on the wire — decodes to a plain lowercase hex string',
    title: 'Prefixed Hex String',
  }),
  S.brand('PrefixedHex'),
)

export type PrefixedHex = S.Schema.Type<typeof PrefixedHex>
