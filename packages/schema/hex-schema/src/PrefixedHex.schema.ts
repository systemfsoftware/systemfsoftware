import { Schema as S, SchemaTransformation } from 'effect'
import { StrictHex } from './StrictHex.schema.js'

const stripHexPrefix = (prefixed: `0x${string}`): string => prefixed.slice(2)

const addHexPrefix = (bare: string): `0x${string}` => `0x${bare}`

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
