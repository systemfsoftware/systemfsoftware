import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { MicroVMSpec, WaitStrategy } from './MicroVMSpec.schema.js'

const WaitStrategyDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-microsandbox/WaitStrategyDecision',
)
type WaitStrategyDecisionTypeId = typeof WaitStrategyDecisionTypeId

export class WaitRequired extends Schema.TaggedClass<WaitRequired>()('WaitRequired', {
  strategy: WaitStrategy,
}) {
  readonly [WaitStrategyDecisionTypeId] = WaitStrategyDecisionTypeId
}

export class WaitSkipped extends Schema.TaggedClass<WaitSkipped>()('WaitSkipped', {}) {
  readonly [WaitStrategyDecisionTypeId] = WaitStrategyDecisionTypeId
}

export const WaitStrategyDecision = Schema.Union([WaitRequired, WaitSkipped])
export type WaitStrategyDecision = typeof WaitStrategyDecision.Type

export class ResolveWaitStrategy extends Schema.TaggedClass<ResolveWaitStrategy>()('ResolveWaitStrategy', {
  spec: MicroVMSpec,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const resolveWaitStrategy = Workflow.make({
  command: ResolveWaitStrategy,
  decision: WaitStrategyDecision,
  error: Schema.Never,
  decide: (command): Result.Result<WaitStrategyDecision, never> =>
    Result.succeed(
      Match.value(command.spec).pipe(
        Match.tag('Job', () => WaitSkipped.make()),
        Match.tag('Service', (service) =>
          Option.match(Option.fromNullishOr(service.waitStrategy), {
            onSome: (strategy) => WaitRequired.make({ strategy }),
            onNone: () =>
              Option.match(Option.fromNullishOr(service.ports[0]), {
                onSome: (port) => WaitRequired.make({ strategy: { _tag: 'Port', port } }),
                onNone: () => WaitSkipped.make(),
              }),
          })),
        Match.exhaustive,
      ),
    ),
})
