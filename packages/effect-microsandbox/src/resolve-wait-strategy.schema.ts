import { Readiness } from '@systemfsoftware/effect-readiness'
import { Schema } from 'effect'
import { WaitStrategy } from './MicroVMSpec.schema.js'

const WaitStrategyDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-microsandbox/WaitStrategyDecision',
)
type WaitStrategyDecisionTypeId = typeof WaitStrategyDecisionTypeId

const { Condition } = Readiness

/**
 * The readiness condition a `WaitRequired` decision carries as data. The decide
 * body names the condition type without importing the readiness package: the
 * schema file that declares the decision is where a foreign pure type is
 * allowed to live, and the decision reaches it through the declared class.
 */
export type ReadinessCondition = (typeof Condition)['Type']

export class WaitRequired extends Schema.TaggedClass<WaitRequired>()('WaitRequired', {
  strategy: WaitStrategy,
  condition: Condition,
  label: Schema.String,
}) {
  readonly [WaitStrategyDecisionTypeId] = WaitStrategyDecisionTypeId
}

export class WaitSkipped extends Schema.TaggedClass<WaitSkipped>()('WaitSkipped', {}) {
  readonly [WaitStrategyDecisionTypeId] = WaitStrategyDecisionTypeId
}

export const WaitStrategyDecision = Schema.Union([WaitRequired, WaitSkipped])
export type WaitStrategyDecision = typeof WaitStrategyDecision.Type
