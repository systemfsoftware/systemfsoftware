import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { MicroVMSpec, WaitStrategy } from './MicroVMSpec.schema.js'

const WaitTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-microsandbox/WaitStrategyDecision')
type WaitTypeId = typeof WaitTypeId

export class WaitRequired extends Schema.TaggedClass<WaitRequired>()('WaitRequired', {
  strategy: WaitStrategy,
}) {
  readonly [WaitTypeId] = WaitTypeId
}

export class WaitSkipped extends Schema.TaggedClass<WaitSkipped>()('WaitSkipped', {}) {
  readonly [WaitTypeId] = WaitTypeId
}

export type WaitStrategyDecision = WaitRequired | WaitSkipped

export class ResolveWaitStrategy extends Schema.TaggedClass<ResolveWaitStrategy>()('ResolveWaitStrategy', {
  spec: MicroVMSpec,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const resolveWaitStrategy = Workflow.total(
  ResolveWaitStrategy,
  (command): Result.Result<WaitStrategyDecision, never> =>
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
)
