import { pipe, Schema as S } from 'effect'
import { HexString } from './hexstring.schema.js'

export const PrefixedHex = pipe(
  S.transform(
    HexString,
    S.String.pipe(
      S.pattern(/^0x[0-9a-f]+$/),
      S.annotations({ arbitrary: () => (fc) => fc.hexaString({ minLength: 1 }).map((hex) => `0x${hex}`) }),
    ),
    {
      strict: true,
      decode: (fromA, _fromI) => `0x${fromA}`,
      encode: (toI) => HexString.make(toI.slice(2)),
    },
  ),
  S.annotations({
    identifier: 'PrefixedHex',
    description: 'A hex string that preserves the 0x prefix',
    examples: [
      '0x1768aaf901cd18feac56426b8139c623b6e202cfb2710179c201b61b895190b0',
      '0xf678e79eb2c70a1201325fbd980a4d1157810519ce86cb49b1b5c868e89fba41',
    ] as const,
    title: 'Prefixed Hex String',
  }),
  S.brand('PrefixedHex'),
)

export type PrefixedHex = S.Schema.Type<typeof PrefixedHex>
