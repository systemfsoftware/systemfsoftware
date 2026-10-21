import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { MicroVMSpec, WaitStrategy } from './MicroVMSpec.schema.js'
import {
  type ReadinessCondition,
  WaitRequired,
  WaitSkipped,
  WaitStrategyDecision,
} from './resolve-wait-strategy.schema.js'

export class ResolveWaitStrategy extends Schema.TaggedClass<ResolveWaitStrategy>()('ResolveWaitStrategy', {
  spec: MicroVMSpec,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const conditionOf = (strategy: WaitStrategy): ReadinessCondition =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }): ReadinessCondition => ({ _tag: 'Tcp', guestPort: port })),
    Match.tag('Http', ({ path, port }): ReadinessCondition => ({ _tag: 'Http', guestPort: port, path })),
    Match.tag('Log', ({ pattern }): ReadinessCondition => ({ _tag: 'Log', pattern })),
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
