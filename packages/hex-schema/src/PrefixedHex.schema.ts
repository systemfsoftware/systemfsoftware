import { Schema as S, SchemaTransformation } from 'effect'
import { addHexPrefix, stripHexPrefix } from './PrefixedHex.js'
import { StrictHex } from './StrictHex.schema.js'

export const PrefixedHex = S.TemplateLiteral(['0x', S.String]).pipe(
  S.decodeTo(
    StrictHex,
    SchemaTransformation.transform({
      decode: stripHexPrefix,
      encode: addHexPrefix,
    }),
  ),
  S.annotate({
    identifier: 'PrefixedHex',
    description: 'A 0x-prefixed hex string on the wire — decodes to a plain lowercase hex string',
    title: 'Prefixed Hex String',
  }),
  S.brand('PrefixedHex'),
)
export type PrefixedHex = S.Schema.Type<typeof PrefixedHex>
