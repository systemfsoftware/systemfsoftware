import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Option, Schema } from 'effect'
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
}) {}

export const resolveWaitStrategy = Workflow.total(
  ResolveWaitStrategy,
  (command): Result.Result<WaitStrategyDecision, never> =>
    Result.succeed(
      Option.match(Option.fromNullishOr(command.spec.waitStrategy), {
        onSome: (strategy) => WaitRequired.make({ strategy }),
        onNone: () =>
          Option.match(Option.fromNullishOr(command.spec.ports[0]), {
            onSome: (port) => WaitRequired.make({ strategy: { _tag: 'Port', port } }),
            onNone: () => WaitSkipped.make(),
          }),
      }),
    ),
)
