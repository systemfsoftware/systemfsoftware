import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { ClassifyJobExit, classifyJobExit, type JobExitStatus } from './classify-job-exit.workflow.js'
import { JobCompletion } from './JobCompletion.schema.js'
import { ExecError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'

const argvOf = (spec: MicroVMSpec): ReadonlyArray<string> =>
  Match.value(spec).pipe(
    Match.tag('Job', (job) => [...job.cmd]),
    Match.tag('Service', () => []),
    Match.exhaustive,
  )

const readJobExit = (acquired: AcquiredVM): Effect.Effect<ClassifyJobExit, ExecError> =>
  Effect.tryPromise({
    try: () => acquired.sandbox.execDefault(),
    catch: (cause) => new ExecError({ argv: argvOf(acquired.spec), cause }),
  }).pipe(
    Effect.map((output) =>
      new ClassifyJobExit({
        code: output.code,
        stdout: output.stdoutBytes(),
        stderr: output.stderrBytes(),
      })
    ),
  )

const writeJobCompletion = (
  outcome: Result.Result<JobExitStatus, never>,
  raw: ClassifyJobExit,
): Effect.Effect<JobCompletion> =>
  Effect.succeed(
    new JobCompletion({ status: Result.getOrThrow(outcome), stdout: raw.stdout, stderr: raw.stderr }),
  )

export const awaitJobCompletion = Sandwich.named('await_job_completion')(readJobExit)
  .decide(classifyJobExit)
  .write(writeJobCompletion)
