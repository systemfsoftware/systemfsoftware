import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const WorkloadExitTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-microvm/WorkloadExit')
type WorkloadExitTypeId = typeof WorkloadExitTypeId

export class WorkloadExitedNormal extends Schema.TaggedClass<WorkloadExitedNormal>()('WorkloadExitedNormal', {}) {
  readonly [WorkloadExitTypeId] = WorkloadExitTypeId
}

export class WorkloadExitedAbnormal extends Schema.TaggedClass<WorkloadExitedAbnormal>()('WorkloadExitedAbnormal', {
  code: Schema.Int,
}) {
  readonly [WorkloadExitTypeId] = WorkloadExitTypeId
}

export const WorkloadExit = Schema.Union([WorkloadExitedNormal, WorkloadExitedAbnormal])
export type WorkloadExit = typeof WorkloadExit.Type

export class ClassifyWorkloadExit extends Schema.TaggedClass<ClassifyWorkloadExit>()('ClassifyWorkloadExit', {
  code: Schema.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { code: 'microvm.workload.exit.code' } as const
}

export const classifyWorkloadExit = Workflow.make({
  command: ClassifyWorkloadExit,
  decision: WorkloadExit,
  error: Schema.Never,
  decide: (command): Result.Result<WorkloadExit, never> =>
    Result.succeed(
      Match.value(command.code === 0).pipe(
        Match.when(true, (): WorkloadExit => new WorkloadExitedNormal({})),
        Match.when(false, (): WorkloadExit => new WorkloadExitedAbnormal({ code: command.code })),
        Match.exhaustive,
      ),
    ),
})
