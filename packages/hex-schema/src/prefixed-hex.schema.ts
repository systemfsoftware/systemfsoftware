import { Schema as S } from 'effect'
import { addHexPrefix, stripHexPrefix } from './prefixed-hex.kernel.js'
import { StrictHex } from './strict-hex.schema.js'

export const PrefixedHex = S.transform(S.TemplateLiteral('0x', S.String), StrictHex, {
  decode: stripHexPrefix,
  encode: addHexPrefix,
}).pipe(
  S.annotations({
    identifier: 'PrefixedHex',
    description: 'A 0x-prefixed hex string on the wire — decodes to a plain lowercase hex string',
    title: 'Prefixed Hex String',
  }),
  S.brand('PrefixedHex'),
)
export type PrefixedHex = S.Schema.Type<typeof PrefixedHex>
