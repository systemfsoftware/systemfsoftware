import { refutes } from '@systemfsoftware/effect-schema-law'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { expectTypeOf } from 'vitest'
import { Uint8ArrayFromPrefixedHex } from '../uint8array-from-prefixed-hex.schema.js'

const bytePairs = fc.stringMatching(/^(?:[0-9a-f]{2})*$/)
const nibble = fc.stringMatching(/^[0-9a-f]$/)

refutes(Uint8ArrayFromPrefixedHex, {
  ByteAlignment: fc
    .tuple(bytePairs, nibble)
    .map(([pairs, odd]) => `0x${pairs}${odd}`),
  Uint8PrefixedHexPrefix: fc.stringMatching(/^(?:[0-9a-f]{2})+$/),
  Uint8PrefixedHexCase: fc.stringMatching(/^(?:[A-F]{2})+$/).map((upper) => `0x${upper}`),
})

expectTypeOf<S.Codec.Encoded<typeof Uint8ArrayFromPrefixedHex>>().toEqualTypeOf<`0x${string}`>()
