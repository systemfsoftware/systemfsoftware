import { it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Exit, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { expectTypeOf } from 'vitest'
import { HexBytes } from '../hex-bytes.schema.js'

const decode = S.decodeUnknownExit(HexBytes)

const oddLengthHex = fc
  .tuple(fc.stringMatching(/^(?:[0-9a-f]{2})*$/), fc.stringMatching(/^[0-9a-f]$/))
  .map(([pairs, odd]) => `${pairs}${odd}`)

/**
 * The wire form is a *kind* contract, not a weakened one: no loosening of
 * `HexBytes` accepts a `Uint8Array`, so a refusal generator for it can state
 * the rejection half but never a discriminating half. It is stated directly.
 */
it.prop('∀b_HexBytesWireIsString_⊥', [fc.uint8Array()], ([bytes]) => !Exit.isSuccess(decode(bytes)))

refutes(HexBytes, {
  HexBytesByteAlignment: oddLengthHex,
  HexBytesAlphabet: fc.stringMatching(/^[g-z]{2}$/),
})

expectTypeOf<S.Codec.Encoded<typeof HexBytes>>().toEqualTypeOf<string>()
