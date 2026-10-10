import { Result, Schema } from 'effect'
import { JobExited, JobSignaled } from './JobExitStatus.schema.js'

export const JobCompletion = Schema.Struct({
  status: Schema.Union([JobExited, JobSignaled]),
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
})
export type JobCompletion = typeof JobCompletion.Type

const presentOrAbsent = <A>(present: boolean, value: A): A | undefined => present ? value : undefined

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  const namesEveryRequiredField = (hasStatus: boolean, hasStdout: boolean, hasStderr: boolean): boolean =>
    [hasStatus, hasStdout, hasStderr].every(Boolean)

  const jobCompletionDecodes = (hasStatus: boolean, hasStdout: boolean, hasStderr: boolean): boolean =>
    Result.isSuccess(
      Schema.decodeUnknownResult(JobCompletion)({
        status: presentOrAbsent(hasStatus, new JobSignaled({})),
        stdout: presentOrAbsent(hasStdout, new Uint8Array()),
        stderr: presentOrAbsent(hasStderr, new Uint8Array()),
      }),
    )

  it.prop(
    '∀f_JobCompletionRefusal_≡EveryFieldPresent',
    { of: [Schema.Boolean, Schema.Boolean, Schema.Boolean], subject: jobCompletionDecodes },
    (subject, [hasStatus, hasStdout, hasStderr]) =>
      subject(hasStatus, hasStdout, hasStderr) === namesEveryRequiredField(hasStatus, hasStdout, hasStderr),
  )
}
