import { it } from '@effect/vitest'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import { PrefixedHex } from './prefixed-hex.schema.js'

const decode = S.decodeUnknownEither(PrefixedHex)

const hexBody = fc.stringMatching(/^[0-9a-f]*$/)

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
  [fc.tuple(hexBody, fc.constantFrom('g', 'z', '!', ' ', '-'), hexBody)],
  ([[head, outsider, tail]]) => Either.isLeft(decode(`0x${head}${outsider}${tail}`)),
)
