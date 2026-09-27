import { Schema } from 'effect'

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
