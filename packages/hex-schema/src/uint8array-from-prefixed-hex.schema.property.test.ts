import { it } from '@effect/vitest'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import { Uint8ArrayFromPrefixedHex } from './uint8array-from-prefixed-hex.schema.js'

const decode = S.decodeUnknownEither(Uint8ArrayFromPrefixedHex)

const bytePairs = fc.stringMatching(/^(?:[0-9a-f]{2})*$/)
const nibble = fc.stringMatching(/^[0-9a-f]$/)

it.prop(
  '∀b_ByteAlignment_⊥',
  [fc.tuple(bytePairs, nibble)],
  ([[pairs, odd]]) => Either.isLeft(decode(`0x${pairs}${odd}`)),
)

it.prop(
  '∀b_Uint8PrefixedHexPrefix_⊥',
  [fc.stringMatching(/^(?:[0-9a-f]{2})+$/)],
  ([body]) => Either.isLeft(decode(body)),
)

it.prop(
  '∀b_Uint8PrefixedHexCase_⊥',
  [fc.stringMatching(/^(?:[A-F]{2})+$/)],
  ([upper]) => Either.isLeft(decode(`0x${upper}`)),
)
