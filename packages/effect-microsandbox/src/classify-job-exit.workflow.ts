import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Option, Schema } from 'effect'
import * as Result from 'effect/Result'

const JobExitStatusTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-microsandbox/JobExitStatusDecision',
)
type JobExitStatusTypeId = typeof JobExitStatusTypeId

export class JobExited extends Schema.TaggedClass<JobExited>()('JobExited', {
  code: Schema.Natural,
}) {
  readonly [JobExitStatusTypeId] = JobExitStatusTypeId
}

export class JobSignaled extends Schema.TaggedClass<JobSignaled>()('JobSignaled', {}) {
  readonly [JobExitStatusTypeId] = JobExitStatusTypeId
}

export const JobExitStatus = Schema.Union([JobExited, JobSignaled])
export type JobExitStatus = typeof JobExitStatus.Type

export class ClassifyJobExit extends Schema.TaggedClass<ClassifyJobExit>()('ClassifyJobExit', {
  code: Schema.Int,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['code'] as const
}

export const classifyJobExit = Workflow.make({
  command: ClassifyJobExit,
  decision: JobExitStatus,
  error: Schema.Never,
  decide: (command): Result.Result<JobExitStatus, never> =>
    Result.succeed(
      Option.match(Schema.decodeOption(Schema.Natural)(command.code), {
        onSome: (code) => JobExited.make({ code }),
        onNone: () => JobSignaled.make(),
      }),
    ),
})
