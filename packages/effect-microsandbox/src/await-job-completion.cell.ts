import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Option } from 'effect'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { ClassifyJobExit, classifyJobExit, JobExited, JobSignaled } from './classify-job-exit.workflow.js'
import { JobCompletion } from './JobCompletion.schema.js'
import { ExecError } from './MicroVMError.schema.js'
import type { SandboxPlan } from './render-sandbox-plan.schema.js'

/**
 * The argv the read names a rejected command with. The decide workflow's plan
 * already carries the job's command (`planOf` sets it for `Job` and leaves it
 * absent for `Service`), so the read gathers that decided value instead of
 * re-dispatching the spec: gathering an absent plan field runs one path.
 */
const argvOf = (plan: SandboxPlan): ReadonlyArray<string> => Option.getOrElse(Option.fromNullishOr(plan.cmd), () => [])

/**
 * The read snapshot the write handlers receive: the encoded `ClassifyJobExit` command plus the
 * argv the read ran, so a rejected command can still name the workload it could not classify.
 */
type JobExitSnapshot = (typeof ClassifyJobExit)['Encoded'] & {
  readonly argv: ReadonlyArray<string>
}
const readJobExit = (acquired: AcquiredVM): Effect.Effect<JobExitSnapshot, ExecError> => {
  const argv = argvOf(acquired.plan)
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
