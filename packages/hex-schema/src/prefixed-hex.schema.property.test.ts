import { refutes } from '@systemfsoftware/effect-schema-law'
import { type Brand, FastCheck as fc, Schema as S } from 'effect'
import { expectTypeOf } from 'vitest'
import { PrefixedHex } from './prefixed-hex.schema.js'

const hexBody = fc.stringMatching(/^[0-9a-f]*$/)
const outsider = fc.stringMatching(/^[^0-9a-f]$/)

refutes(PrefixedHex, {
  PrefixedHexPrefix: fc.stringMatching(/^[0-9a-f]+$/),
  PrefixedHexCase: fc.stringMatching(/^[A-F]+$/).map((upper) => `0x${upper}`),
  PrefixedHexAlphabet: fc
    .tuple(hexBody, outsider, hexBody)
    .map(([head, out, tail]) => `0x${head}${out}${tail}`),
})

/**
 * The reason the package exists: a consumer whose API demands `0x${string}`
 * passes `S.encodeSync` straight in. A false `expectTypeOf` is a `tsc` error,
 * which is the channel the mutation gate reads.
 */
expectTypeOf<S.Schema.Encoded<typeof PrefixedHex>>().toEqualTypeOf<`0x${string}`>()

expectTypeOf<S.Schema.Type<typeof PrefixedHex>>().toEqualTypeOf<string & Brand.Brand<'PrefixedHex'>>()
