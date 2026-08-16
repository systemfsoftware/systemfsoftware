import { it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { type Brand, Exit, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { expectTypeOf } from 'vitest'
import { PrefixedHex } from '../prefixed-hex.schema.js'

const decode = S.decodeUnknownExit(PrefixedHex)

const hexBody = fc.stringMatching(/^[0-9a-f]*$/)
const outsider = fc.stringMatching(/^[^0-9a-f]$/)

/**
 * The `0x` prefix is a *joint* contract with the body in v4's AST — no
 * weakening of `PrefixedHex` admits an unprefixed string, so an unprefixed
 * refusal generator can state the rejection half but never a discriminating
 * half. It is stated directly; the prefixed invalid-body draws below witness
 * the body obligation.
 */
it.prop('∀b_PrefixedHexPrefix_⊥', [fc.stringMatching(/^[0-9a-f]+$/)], ([bare]) => !Exit.isSuccess(decode(bare)))

refutes(PrefixedHex, {
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
expectTypeOf<S.Codec.Encoded<typeof PrefixedHex>>().toEqualTypeOf<`0x${string}`>()

expectTypeOf<S.Schema.Type<typeof PrefixedHex>>().toEqualTypeOf<string & Brand.Brand<'PrefixedHex'>>()
