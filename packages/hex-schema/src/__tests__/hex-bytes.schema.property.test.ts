import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc, Schema as S } from 'effect'
import { expectTypeOf } from 'vitest'
import { HexBytes } from '../hex-bytes.schema.js'

const oddLengthHex = fc
  .tuple(fc.stringMatching(/^(?:[0-9a-f]{2})*$/), fc.stringMatching(/^[0-9a-f]$/))
  .map(([pairs, odd]) => `${pairs}${odd}`)

refutes(HexBytes, {
  HexBytesWireIsString: fc.uint8Array(),
  HexBytesByteAlignment: oddLengthHex,
  HexBytesAlphabet: fc.stringMatching(/^[g-z]{2}$/),
})

expectTypeOf<S.Schema.Encoded<typeof HexBytes>>().toEqualTypeOf<string>()
