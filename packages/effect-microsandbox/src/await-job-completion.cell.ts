import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as Match from 'effect/Match'
import { ClassifyJobExit, classifyJobExit, JobExited, JobSignaled } from './classify-job-exit.workflow.js'
import { JobCompletion } from './JobCompletion.schema.js'
import { ExecError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import { awaitExit, type RunningVMType } from './running-vm.handle.js'

export interface JobExitInput {
  readonly vm: RunningVMType
  readonly spec: MicroVMSpec
}

const argvOf = (spec: MicroVMSpec): ReadonlyArray<string> =>
  Match.value(spec).pipe(
    Match.tag('Job', (job) => [...job.cmd]),
    Match.tag('Service', () => []),
    Match.exhaustive,
  )

type JobExitSnapshot = (typeof ClassifyJobExit)['Encoded'] & {
  readonly argv: ReadonlyArray<string>
}

const readJobExit = (input: JobExitInput): Effect.Effect<JobExitSnapshot, ExecError> => {
  const argv = argvOf(input.spec)
  return Effect.map(awaitExit(input.vm, argv), (output) => ({
    _tag: 'ClassifyJobExit',
    code: output.code,
    stdout: output.stdout,
    stderr: output.stderr,
    argv,
  }))
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
