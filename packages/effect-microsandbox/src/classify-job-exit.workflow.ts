import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { JobExited, JobExitStatus, JobSignaled } from './JobExitStatus.schema.js'

export class ClassifyJobExit extends Schema.TaggedClass<ClassifyJobExit>()('ClassifyJobExit', {
  code: Schema.Int,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
}) {
  static readonly [Workflow.InstrumentationBrand] = { code: 'microsandbox.job.exit.code' } as const
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
