import { Schema as S, SchemaTransformation } from 'effect'
import { StrictHex } from './StrictHex.schema.js'

const toStrictHex = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase()

export const HexString = S.String.pipe(
  S.annotate({
    identifier: 'HexStringInput',
    description: 'A hex string, optionally prefixed with 0x (empty string allowed)',
  }),
  S.decodeTo(
    StrictHex,
    SchemaTransformation.transform({
      decode: toStrictHex,
      encode: (s) => s,
    }),
  ),
  S.annotate({
    identifier: 'HexString',
    description: 'A string representing hexadecimal data, with or without the 0x prefix',
    title: 'Hex String',
  }),
  S.brand('HexString'),
)

export type HexString = S.Schema.Type<typeof HexString>
