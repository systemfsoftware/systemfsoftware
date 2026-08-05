import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Arbitrary, Either, FastCheck as fc, Schema } from 'effect'
import { DEFAULT_MAX_CHILDREN } from '../../supervisor-dynamic.kernel.js'
import { DecideInput } from '../restart-decision.schema.js'

const BOUND_MESSAGE = 'failedIndex must be < totalChildren'
const OVERSHOOT = 8

const decodeOf = (input: unknown) => Schema.decodeUnknownEither(DecideInput)(input)

const messageOf = (input: unknown): string =>
  Either.match(decodeOf(input), { onLeft: (error) => error.message, onRight: () => '' })

it.prop('∀d_SampledInput_∈DeclaredBounds', [DecideInput], ([input]) =>
  input.failedIndex >= 0 &&
  input.failedIndex < input.totalChildren &&
  input.totalChildren <= DEFAULT_MAX_CHILDREN)

it.prop('∀g_IndexAtOrPastWidth_=Left', [fc.gen()], ([g]) => {
  const sampled = g(Arbitrary.make, DecideInput)
  const failedIndex = g(fc.integer, {
    min: sampled.totalChildren,
    max: Math.min(sampled.totalChildren + OVERSHOOT, DEFAULT_MAX_CHILDREN),
  })
  return Either.isLeft(decodeOf({ ...sampled, failedIndex }))
})

it.prop('∀g_IndexAtOrPastWidth_⊇BoundMessage', [fc.gen()], ([g]) => {
  const sampled = g(Arbitrary.make, DecideInput)
  const failedIndex = g(fc.integer, {
    min: sampled.totalChildren,
    max: Math.min(sampled.totalChildren + OVERSHOOT, DEFAULT_MAX_CHILDREN),
  })
  return messageOf({ ...sampled, failedIndex }).includes(BOUND_MESSAGE)
})

it.prop('∀g_WidthPastEnforcedCap_=Left', [fc.gen()], ([g]) => {
  const sampled = g(Arbitrary.make, DecideInput)
  const totalChildren = g(fc.integer, {
    min: DEFAULT_MAX_CHILDREN + 1,
    max: DEFAULT_MAX_CHILDREN + OVERSHOOT,
  })
  return Either.isLeft(decodeOf({ ...sampled, totalChildren }))
})
