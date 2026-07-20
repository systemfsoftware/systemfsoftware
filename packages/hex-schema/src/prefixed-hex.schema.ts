import { pipe, Schema as S } from 'effect'
import { StrictHex } from './strict-hex.schema.js'

export const PrefixedHex = pipe(
  S.transform(
    S.String.pipe(
      S.pattern(/^0x[0-9a-f]*$/),
      S.annotations({ arbitrary: () => (fc) => fc.hexaString().map((hex) => `0x${hex}`) }),
    ),
    StrictHex,
    {
      strict: true,
      decode: (fromA) => fromA.slice(2),
      encode: (toI) => `0x${toI}`,
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
