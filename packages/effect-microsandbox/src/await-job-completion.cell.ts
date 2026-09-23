import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as Match from 'effect/Match'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { ClassifyJobExit, classifyJobExit, JobExited, JobSignaled } from './classify-job-exit.workflow.js'
import { JobCompletion } from './JobCompletion.schema.js'
import { ExecError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'

const argvOf = (spec: MicroVMSpec): ReadonlyArray<string> =>
  Match.value(spec).pipe(
    Match.tag('Job', (job) => [...job.cmd]),
    Match.tag('Service', () => []),
    Match.exhaustive,
  )

/**
 * The read snapshot the write handlers receive: the encoded `ClassifyJobExit` command plus the
 * argv the read ran, so a rejected command can still name the workload it could not classify.
 */
type JobExitSnapshot = (typeof ClassifyJobExit)['Encoded'] & {
  readonly argv: ReadonlyArray<string>
}

const readJobExit = (acquired: AcquiredVM): Effect.Effect<JobExitSnapshot, ExecError> => {
  const argv = argvOf(acquired.spec)
  return Effect.map(
    Effect.tryPromise({
      try: () => acquired.sandbox.execDefault(),
      catch: (cause) => new ExecError({ argv, cause }),
    }),
    (output) => ({
      _tag: 'ClassifyJobExit',
      code: output.code,
      stdout: output.stdoutBytes(),
      stderr: output.stderrBytes(),
      argv,
    }),
  )
}

export const awaitJobCompletion = Sandwich.named('await_job_completion')(readJobExit)
  .decide(classifyJobExit)
  .write({
    JobExited: (status, command) =>
      Effect.succeed(
        new JobCompletion({
          status: JobExited.make({ code: status.code }),
          stdout: command.stdout,
          stderr: command.stderr,
        }),
      ),
    JobSignaled: (_status, command) =>
      Effect.succeed(
        new JobCompletion({ status: JobSignaled.make({}), stdout: command.stdout, stderr: command.stderr }),
      ),
    CommandRejected: (rejected, command) => Effect.fail(new ExecError({ argv: command.argv, cause: rejected })),
  })
