import { it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import { StrictHex } from '../strict-hex.schema.js'

const decode = S.decodeUnknownEither(StrictHex)

const hexPart = fc.stringMatching(/^[0-9a-f]*$/)
const outsider = fc.stringMatching(/^[^0-9a-f]$/)

/**
 * `StrictHex` is the alphabet the rest of the package defers to — `PrefixedHex`
 * and `HexString` both state their body through it — and nothing exercised it
 * directly. The generated laws draw from its own arbitrary, so every value they
 * feed it is one it already accepts.
 *
 * Every draw is a non-empty even-length body, so a class narrowed to a single
 * character and a class negated outright each fail on every draw rather than on
 * a lucky one.
 */
it.prop(
  '∀h_StrictHex_=x',
  [fc.stringMatching(/^(?:[0-9a-f]{2})+$/)],
  ([hex]) => {
    const result = decode(hex)
    return Either.isRight(result) && result.right === hex
  },
)

/**
 * An unanchored pattern admits every string — drop `^` and a match remains at
 * the tail, drop `$` and one remains at the head — so a character spliced
 * anywhere in the body is refused only while both anchors stand.
 *
 * The outsider is the complement of the alphabet rather than a hand-picked set,
 * so uppercase is in the domain by construction: this schema is lowercase-only,
 * and that is the distinction `HexString` leans on when it lowercases before
 * delegating here.
 */
refutes(StrictHex, {
  StrictHexAlphabet: fc.tuple(hexPart, outsider, hexPart).map(([head, out, tail]) => `${head}${out}${tail}`),
})
