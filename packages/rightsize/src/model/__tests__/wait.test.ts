/**
 * Closed-union properties for `WaitStrategy`: the union has no open
 * extensibility — every draw of a member mutated onto an unknown `_tag`
 * must be refused, while every generated member decodes to itself. The
 * unknown tag is derived from the domain itself (each declared tag suffixed,
 * plus a wholly foreign tag), so the refusal set can never silently coincide
 * with a future member's name.
 */
import { it } from '@effect/vitest'
import { Exit, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { WaitStrategy } from '../wait.js'

const decodeUnknown = S.decodeUnknownExit(WaitStrategy)

/** The five declared member tags — the closed set the union names. */
const KNOWN_TAGS = ['ForPort', 'ForHttp', 'ForLogMessage', 'ForHealthCheck', 'ForShell'] as const

/** Unknown tags: declared tags mutated (suffixed) plus a wholly foreign one. */
const unknownTag = fc.constantFrom(...KNOWN_TAGS.map((tag) => `${tag}x`), 'Bogus')

/** A valid member with its `_tag` replaced by an unknown one — shape from the domain, tag from outside it. */
const mutatedMember = fc
  .tuple(S.toArbitrary(WaitStrategy)(fc), unknownTag)
  .map(([member, tag]): unknown => ({ ...member, _tag: tag }))

it.prop('∀w_UnknownTag_⊥WaitStrategy', [mutatedMember], ([member]) => Exit.isFailure(decodeUnknown(member)))

it.prop(
  '∀w_Member_∈WaitStrategy',
  [S.toArbitrary(WaitStrategy)(fc)],
  ([member]) => Exit.isSuccess(decodeUnknown(member)),
)
