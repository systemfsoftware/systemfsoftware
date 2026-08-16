import { it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Duration, Exit, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { DynamicLimitExceeded } from '../daemon-health.schema.js'
import { IntensityConfig } from '../daemon-policy.schema.js'

const window = Duration.seconds(1)

const negative = fc.integer({ min: -100, max: -1 })
const nonInteger = fc.integer({ min: 0, max: 98 }).map((n) => n + 0.5)

// The refutes helpers discharge per AST-node obligations; under v4 the integer
// refinement and the bound check share one node, so a negative integer is a
// refusal no simple weakening explains. It is still a refusal contract, so it is
// asserted directly below rather than dropped.
refutes(IntensityConfig, {
  RestartsNonInteger: nonInteger.map((restarts) => ({ restarts, window })),
})

refutes(DynamicLimitExceeded, {
  LimitNonInteger: nonInteger.map((limit) => ({ _tag: 'DynamicLimitExceeded', limit })),
})

it.prop(
  '∀r_NegativeRestarts_⊥',
  [negative.map((restarts) => ({ restarts, window }))],
  ([input]) => Exit.isFailure(S.decodeExit(IntensityConfig)(input)),
)

it.prop(
  '∀l_NegativeLimit_⊥',
  [negative.map((limit) => ({ _tag: 'DynamicLimitExceeded' as const, limit }))],
  ([input]) => Exit.isFailure(S.decodeExit(DynamicLimitExceeded)(input)),
)
