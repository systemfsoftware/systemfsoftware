import { Effect, Stream } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import type { CommandInput } from 'effect/process/ChildProcess'

import { GuardError } from './guard-error.schema.js'

const encoder = new TextEncoder()

export type GitRequest = {
  readonly args: readonly string[]
  readonly stdin?: string | undefined
}

const gitFailed = (args: readonly string[], detail: string): GuardError =>
  new GuardError({ message: `git ${args.join(' ')} failed: ${detail}` })

const stdinInput = (stdin: string | undefined): CommandInput =>
  stdin === undefined ? 'ignore' : Stream.make(encoder.encode(stdin))

/**
 * Run `git`, optionally feeding `stdin`, and return its stdout as text.
 *
 * A non-zero exit becomes a `GuardError` carrying git's own stderr, so a
 * missing ref or a dirty tree names itself instead of throwing a stack trace.
 * The process is spawned through the platform's `ChildProcessSpawner`, so the
 * shell never reaches for a Node builtin directly.
 */
export const runGit = (
  request: GitRequest,
): Effect.Effect<string, GuardError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const command = ChildProcess.make('git', [...request.args], { stdin: stdinInput(request.stdin) })
      const handle = yield* spawner.spawn(command).pipe(
        Effect.mapError((error) => gitFailed(request.args, error.message)),
      )
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout)).pipe(
        Effect.mapError((error) => gitFailed(request.args, error.message)),
      )
      const err = yield* Stream.mkString(Stream.decodeText(handle.stderr)).pipe(
        Effect.mapError((error) => gitFailed(request.args, error.message)),
      )
      const code = yield* handle.exitCode.pipe(Effect.mapError((error) => gitFailed(request.args, error.message)))
      return yield* code === 0 ? Effect.succeed(out) : Effect.fail(gitFailed(request.args, err.trim()))
    }),
  )

export const lines = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0)
