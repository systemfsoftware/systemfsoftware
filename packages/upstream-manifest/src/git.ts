import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { Context, Effect, Layer, Stream } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import type { CommandInput } from 'effect/process/ChildProcess'

import { GuardError } from './guard-error.schema.js'

const encoder = new TextEncoder()

export type GitRequest = {
  readonly args: readonly string[]
  readonly stdin?: string | undefined
}

/** One `git` invocation, answered by an adapter — the real spawner or the in-memory double. */
export class Git
  extends Context.Service<Git, { readonly run: (request: GitRequest) => Effect.Effect<string, GuardError> }>()(
    '@systemfsoftware/upstream-manifest/git',
  )
{}

type Spawner = Context.Service.Shape<typeof ChildProcessSpawner.ChildProcessSpawner>

const gitFailed = (args: readonly string[], detail: string): GuardError =>
  GuardError.make({ message: `git ${args.join(' ')} failed: ${detail}` })

const stdinInput = (stdin: string | undefined): CommandInput =>
  stdin === undefined ? 'ignore' : Stream.make(encoder.encode(stdin))

const runGitWith = (
  spawner: Spawner,
  request: GitRequest,
): Effect.Effect<string, GuardError> =>
  Effect.scoped(
    Effect.gen(function*() {
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

/**
 * The real adapter: spawn `git` through the platform's `ChildProcessSpawner`, so
 * the shell never reaches for a Node builtin directly. A non-zero exit becomes a
 * `GuardError` carrying git's own stderr, so a missing ref or a dirty tree names
 * itself instead of throwing a stack trace.
 */
export const GitLive: Layer.Layer<Git, never, ChildProcessSpawner.ChildProcessSpawner> = Layer.effect(
  Git,
  Effect.map(
    ChildProcessSpawner.ChildProcessSpawner,
    (spawner: Spawner) => Git.of({ run: (request: GitRequest) => runGitWith(spawner, request) }),
  ),
)

/** Run `git`, optionally feeding `stdin`, and return its stdout as text. */
export const runGit = (request: GitRequest): Effect.Effect<string, GuardError, Git> =>
  Effect.flatMap(Git, (git) => git.run(request))

const concatBytes = (head: Uint8Array, body: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(head.length + body.length)
  joined.set(head)
  joined.set(body, head.length)
  return joined
}

/** Git's content address for `content`: sha1 over `"blob <byte length>\0"` then the bytes. */
export const gitBlobHash = (content: string): string => {
  const body = encoder.encode(content)
  return bytesToHex(sha1(concatBytes(encoder.encode(`blob ${body.length}\u0000`), body)))
}

export const lines = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0)
