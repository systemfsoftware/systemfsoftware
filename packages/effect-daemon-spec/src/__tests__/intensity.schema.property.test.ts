import { refutes } from '@systemfsoftware/effect-schema-law'
import { Duration, FastCheck as fc } from 'effect'
import { DynamicLimitExceeded } from '../daemon-health/daemon-health.schema.js'
import { IntensityConfig } from '../daemon-spec/daemon-policy.schema.js'

const window = Duration.seconds(1)

const negative = fc.integer({ min: -100, max: -1 })
const nonInteger = fc.integer({ min: 0, max: 98 }).map((n) => n + 0.5)

refutes(IntensityConfig, {
  RestartsNegative: negative.map((restarts) => ({ restarts, window })),
  RestartsNonInteger: nonInteger.map((restarts) => ({ restarts, window })),
})

refutes(DynamicLimitExceeded, {
  LimitNegative: negative.map((limit) => ({ _tag: 'DynamicLimitExceeded', limit })),
  LimitNonInteger: nonInteger.map((limit) => ({ _tag: 'DynamicLimitExceeded', limit })),
})
