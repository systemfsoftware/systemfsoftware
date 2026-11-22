/** @internal The checked-out commit, read from git in a directory. */
import { Effect, Stream } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import { GitHeadUnreadable } from './git-head-unreadable.schema.js'

const textOf = (stream: Stream.Stream<Uint8Array, PlatformError>) => Stream.mkString(Stream.decodeText(stream))

const unreadable = (directory: string, detail: string): GitHeadUnreadable =>
  new GitHeadUnreadable({ directory, detail })

const runGit = (directory: string) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(ChildProcess.make({ cwd: directory })`git rev-parse HEAD`)
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [textOf(handle.stdout), textOf(handle.stderr), handle.exitCode],
      { concurrency: 'unbounded' },
    )
    return { stdout, stderr, exitCode }
  }).pipe(Effect.scoped, Effect.mapError((error) => unreadable(directory, error.message)))

/** @internal */
export const gitHeadOf = (
  directory: string,
): Effect.Effect<string, GitHeadUnreadable, ChildProcessSpawner.ChildProcessSpawner> =>
  runGit(directory).pipe(
    Effect.flatMap(({ stdout, stderr, exitCode }) =>
      exitCode === 0 ? Effect.succeed(stdout.trim()) : Effect.fail(unreadable(directory, stderr.trim()))
    ),
  )
