import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Option, Schema } from 'effect'
import * as Result from 'effect/Result'

const JobExitTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-microsandbox/JobExitStatusDecision')
type JobExitTypeId = typeof JobExitTypeId

export class JobExited extends Schema.TaggedClass<JobExited>()('JobExited', {
  code: Schema.Natural,
}) {
  readonly [JobExitTypeId] = JobExitTypeId
}

export class JobSignaled extends Schema.TaggedClass<JobSignaled>()('JobSignaled', {}) {
  readonly [JobExitTypeId] = JobExitTypeId
}

export type JobExitStatus = JobExited | JobSignaled

export class ClassifyJobExit extends Schema.TaggedClass<ClassifyJobExit>()('ClassifyJobExit', {
  code: Schema.Int,
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['code'] as const
}

export const classifyJobExit = Workflow.total(
  ClassifyJobExit,
  (command): Result.Result<JobExitStatus, never> =>
    Result.succeed(
      Option.match(Schema.decodeOption(Schema.Natural)(command.code), {
        onSome: (code) => JobExited.make({ code }),
        onNone: () => JobSignaled.make(),
      }),
    ),
)
