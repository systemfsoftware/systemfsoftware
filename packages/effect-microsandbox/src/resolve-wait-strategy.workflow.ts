import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { MicroVMSpec, WaitStrategy } from './MicroVMSpec.schema.js'

const WaitStrategyDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-microsandbox/WaitStrategyDecision',
)
type WaitStrategyDecisionTypeId = typeof WaitStrategyDecisionTypeId

const { Condition } = Readiness

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

export class ResolveWaitStrategy extends Schema.TaggedClass<ResolveWaitStrategy>()('ResolveWaitStrategy', {
  spec: MicroVMSpec,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const conditionOf = (strategy: WaitStrategy): (typeof Condition)['Type'] =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }): (typeof Condition)['Type'] => ({ _tag: 'Tcp', guestPort: port })),
    Match.tag('Http', ({ path, port }): (typeof Condition)['Type'] => ({ _tag: 'Http', guestPort: port, path })),
    Match.tag('Log', ({ pattern }): (typeof Condition)['Type'] => ({ _tag: 'Log', pattern })),
    Match.exhaustive,
  )

const labelOf = (strategy: WaitStrategy): string =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => `port:${port}`),
    Match.tag('Http', ({ path, port }) => `http:${path}@${port}`),
    Match.tag('Log', ({ pattern }) => `log:${pattern}`),
    Match.exhaustive,
  )

const requiredOf = (strategy: WaitStrategy): WaitRequired =>
  WaitRequired.make({ strategy, condition: conditionOf(strategy), label: labelOf(strategy) })

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
            onSome: (strategy) => requiredOf(strategy),
            onNone: () =>
              Option.match(Option.fromNullishOr(service.ports[0]), {
                onSome: (port) => requiredOf({ _tag: 'Port', port }),
                onNone: () => WaitSkipped.make(),
              }),
          })),
        Match.exhaustive,
      ),
    ),
})
