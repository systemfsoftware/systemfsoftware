import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const VmTeardownTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-microvm/VmTeardown')
type VmTeardownTypeId = typeof VmTeardownTypeId

export class KillVm extends Schema.TaggedClass<KillVm>()('KillVm', {}) {
  readonly [VmTeardownTypeId] = VmTeardownTypeId
}

export class StopVmWithin extends Schema.TaggedClass<StopVmWithin>()('StopVmWithin', {
  millis: Schema.Int,
}) {
  readonly [VmTeardownTypeId] = VmTeardownTypeId
}

export class StopVm extends Schema.TaggedClass<StopVm>()('StopVm', {}) {
  readonly [VmTeardownTypeId] = VmTeardownTypeId
}

export const VmTeardown = Schema.Union([KillVm, StopVmWithin, StopVm])
export type VmTeardown = typeof VmTeardown.Type

export class PlanVmTeardown extends Schema.TaggedClass<PlanVmTeardown>()('PlanVmTeardown', {
  mode: Supervisor.Medium.ShutdownMode,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const planVmTeardown = Workflow.make({
  command: PlanVmTeardown,
  decision: VmTeardown,
  error: Schema.Never,
  decide: (command): Result.Result<VmTeardown, never> =>
    Result.succeed(
      Match.value(command.mode).pipe(
        Match.tag('Brutal', (): VmTeardown => new KillVm({})),
        Match.tag('Graceful', (graceful): VmTeardown => new StopVmWithin({ millis: graceful.millis })),
        Match.tag('Infinity', (): VmTeardown => new StopVm({})),
        Match.exhaustive,
      ),
    ),
})
