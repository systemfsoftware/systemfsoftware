import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { WorkloadExit, WorkloadExitedAbnormal, WorkloadExitedNormal } from './WorkloadExit.schema.js'

export class ClassifyWorkloadExit extends Schema.TaggedClass<ClassifyWorkloadExit>()('ClassifyWorkloadExit', {
  code: Schema.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
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
