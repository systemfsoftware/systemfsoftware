import { it } from '@effect/vitest'
import { type Brand, Either, FastCheck as fc, Schema as S } from 'effect'
import { expectTypeOf } from 'vitest'
import { PrefixedHex } from './prefixed-hex.schema.js'

const decode = S.decodeUnknownEither(PrefixedHex)

const hexBody = fc.stringMatching(/^[0-9a-f]*$/)
const outsider = fc.stringMatching(/^[^0-9a-f]$/)

it.prop(
  '∀b_PrefixedHexPrefix_⊥',
  [fc.stringMatching(/^[0-9a-f]+$/)],
  ([body]) => Either.isLeft(decode(body)),
)

it.prop(
  '∀b_PrefixedHexCase_⊥',
  [fc.stringMatching(/^[A-F]+$/)],
  ([upper]) => Either.isLeft(decode(`0x${upper}`)),
)

it.prop(
  '∀b_PrefixedHexAlphabet_⊥',
  [fc.tuple(hexBody, outsider, hexBody)],
  ([[head, out, tail]]) => Either.isLeft(decode(`0x${head}${out}${tail}`)),
)

/**
 * The reason the package exists: a consumer whose API demands `0x${string}`
 * passes `S.encodeSync` straight in. A false `expectTypeOf` is a `tsc` error,
 * which is the channel the mutation gate reads.
 */
expectTypeOf<S.Schema.Encoded<typeof PrefixedHex>>().toEqualTypeOf<`0x${string}`>()

expectTypeOf<S.Schema.Type<typeof PrefixedHex>>().toEqualTypeOf<string & Brand.Brand<'PrefixedHex'>>()
