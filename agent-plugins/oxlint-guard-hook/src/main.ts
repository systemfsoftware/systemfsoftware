import { DenoRuntime, DenoServices } from '@effect/platform-deno'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Console, Effect, Option, Stream } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'
import { Stdio } from 'effect/Stdio'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { inputErrorResponse, makeGuardAdapters, stdinPayload } from './adapters.ts'
import { STDIN_CAP_BYTES } from './constants.ts'
import { LintFailure } from './flow.schema.ts'
import { buildGuardCell } from './guard.cell.ts'
// The I/O sandwich: read stdin (impure) → one Cell whose phases carry every
// decision from raw payload text to the response (decode/decide/encode pure
// between the impure read and write) → write the response (impure).
const program = Effect.gen(function*() {
  const stdio = yield* Stdio
  const args = yield* stdio.args
  const cwd = args[0] ?? '.'
  const rootOverride = Option.getOrUndefined(
    Option.filter(Option.fromNullishOr(args[1]), (value) => value !== ''),
  )
  const stdin = stdinPayload(yield* Stream.runCollect(stdio.stdin.pipe(Stream.take(STDIN_CAP_BYTES + 1))))

  const adapters = makeGuardAdapters({
    fs: yield* FileSystem,
    path: yield* Path,
    spawner: yield* ChildProcessSpawner,
    cwd,
    rootOverride,
  })

  const result = yield* Effect.catchEager(
    Cell.apply(buildGuardCell(adapters), stdin),
    (error) => Effect.succeed(inputErrorResponse(error)),
  )

  // The write bread: the stderr diagnostic is the hook contract's product
  // output, and a blocking exit code rides LintFailure's errorExitCode.
  if (result.stderr !== '') {
    yield* Console.error(result.stderr)
  }
  if (result.exitCode !== 0) {
    return yield* Effect.fail(new LintFailure({ exitCode: result.exitCode, message: result.stderr }))
  }
}).pipe(Effect.provide(DenoServices.layer))

DenoRuntime.runMain(program)
