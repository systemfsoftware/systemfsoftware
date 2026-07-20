import { pipe, Schema as S } from 'effect'
import { StrictHex } from './strict-hex.schema.js'

export const HexString = pipe(
  S.transform(
    S.String.pipe(
      S.pattern(/^(0x)?[0-9a-fA-F]*$/),
      S.annotations({
        arbitrary: () => (fc) => fc.stringMatching(/^(0x)?[0-9a-fA-F]*$/),
        identifier: 'HexStringInput',
        description: 'A hex string, optionally prefixed with 0x (empty string allowed)',
      }),
    ),
    StrictHex,
    {
      decode: (hex) => (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase(),
      encode: (s) => s,
    },
  ),
  S.annotations({
    identifier: 'HexString',
    description: 'A string representing hexadecimal data, with or without the 0x prefix',
    title: 'Hex String',
  }),
  S.brand('HexString'),
)

export type HexString = S.Schema.Type<typeof HexString>
