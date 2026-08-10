import { it } from '@systemfsoftware/effect-gherkin-spec'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Arbitrary, Either, FastCheck as fc, Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from '../../brands.kernel.js'
import { DecideInput } from '../restart-decision.schema.js'

const BOUND_MESSAGE = 'failedIndex must be < totalChildren'
const OVERSHOOT = 8

const decodeOf = (input: unknown) => Schema.decodeUnknownEither(DecideInput)(input)

const messageOf = (input: unknown): string =>
  Either.match(decodeOf(input), { onLeft: (error) => error.message, onRight: () => '' })

it.prop('∀d_SampledInput_∈DeclaredBounds', [DecideInput], ([input]) =>
  input.failedIndex >= 0 &&
  input.failedIndex < input.totalChildren &&
  input.totalChildren <= MAX_CHILDREN_CEILING)

it.prop('∀g_IndexAtOrPastWidth_=Left', [fc.gen()], ([g]) => {
  const sampled = g(Arbitrary.make, DecideInput)
  const failedIndex = g(fc.integer, {
    min: sampled.totalChildren,
    max: Math.min(sampled.totalChildren + OVERSHOOT, MAX_CHILDREN_CEILING),
  })
  return Either.isLeft(decodeOf({ ...sampled, failedIndex }))
})

it.prop('∀g_IndexAtOrPastWidth_⊇BoundMessage', [fc.gen()], ([g]) => {
  const sampled = g(Arbitrary.make, DecideInput)
  const failedIndex = g(fc.integer, {
    min: sampled.totalChildren,
    max: Math.min(sampled.totalChildren + OVERSHOOT, MAX_CHILDREN_CEILING),
  })
  return messageOf({ ...sampled, failedIndex }).includes(BOUND_MESSAGE)
})

it.prop('∀g_WidthPastEnforcedCap_=Left', [fc.gen()], ([g]) => {
  const sampled = g(Arbitrary.make, DecideInput)
  const totalChildren = g(fc.integer, {
    min: MAX_CHILDREN_CEILING + 1,
    max: MAX_CHILDREN_CEILING + OVERSHOOT,
  })
  return Either.isLeft(decodeOf({ ...sampled, totalChildren }))
})

refutes(DecideInput, {
  DecideIndexPastWidth: fc.record({
    strategy: fc.constantFrom('one_for_one'),
    totalChildren: fc.integer({ min: 1, max: 100 }),
    failedIndex: fc.integer({ min: 0, max: 99 }),
    exitSuccess: fc.boolean(),
    intensityExceeded: fc.boolean(),
  }).map((d) => ({ ...d, failedIndex: d.totalChildren + (d.failedIndex % 5) })),
  DecideWidthPastCap: fc.record({
    strategy: fc.constantFrom('one_for_one'),
    totalChildren: fc.integer({ min: MAX_CHILDREN_CEILING + 1, max: MAX_CHILDREN_CEILING + 500 }),
    failedIndex: fc.constant(0),
    exitSuccess: fc.boolean(),
    intensityExceeded: fc.boolean(),
  }),
  DecideWidthNonInteger: fc.record({
    strategy: fc.constantFrom('one_for_one'),
    totalChildren: fc.integer({ min: 1, max: 98 }).map((n) => n + 0.5),
    failedIndex: fc.constant(0),
    exitSuccess: fc.boolean(),
    intensityExceeded: fc.boolean(),
  }),
  DecideIndexNegative: fc.record({
    strategy: fc.constantFrom('one_for_one'),
    totalChildren: fc.integer({ min: 1, max: 100 }),
    failedIndex: fc.integer({ min: -100, max: -1 }),
    exitSuccess: fc.boolean(),
    intensityExceeded: fc.boolean(),
  }),
})
