/**
 * The injectable msb CLI runner seam — every effectful byte this backend
 * spends talking to the `msb` binary flows through one `CommandRunner`
 * service, so the adapters are unit-testable against scripted doubles
 * (recorded argv + scripted responses) and the real child-process
 * implementation is the single edge, built once by the layer from the
 * provisioned binary path.
 *
 * Three invocation shapes, mirroring upstream `src/backend-msb/invoke.ts`
 * and `backend.ts` exactly:
 *
 * - `invoke` — one invocation to completion, stdout/stderr drained
 *   line-by-line, an exit-code result, and a rejection ONLY on spawn failure
 *   or timeout (never on a non-zero exit — a failing `msb logs` call still
 *   resolves with whatever stdout it produced);
 * - `fetchStdoutExact` — one invocation's stdout byte-exact (CRLF normalized
 *   to LF, trailing-newline presence preserved), rejecting on a non-zero
 *   exit (the follow-logs tail replay keys on an unterminated tail, so the
 *   line-reconstruction of `invoke` would erase the signal);
 * - `spawn` — a held child with raw streams for the stream consumers: the
 *   attached `msb run` supervisor, the `msb logs -f` follower, and the
 *   exec-stream tunnels. Closed stdin by default (`msb exec` forwards a
 *   held-open stdin pipe straight through and blocks on EOF — upstream's
 *   `CLOSED_STDIN`); the tunnel opt-in is `stdin: 'pipe'`.
 *
 * `spawnSync` is the synchronous, blocking teardown edge for the
 * process-exit path (`registerMsbCleanupSync`), where the event loop is not
 * available to await anything.
 */
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import * as readline from 'node:readline'

import { Effect, Match } from 'effect'

import type { ExecResult } from '../model/container-spec.js'
import { BackendError } from '../model/errors.js'

/** A spawned msb child exactly as the CLI driver consumes it: raw streams, an exit promise, a kill. */
export interface CliChild {
  /** Resolves once the process exits, with its exit code; `null` when it was killed without a code. */
  readonly exited: Promise<number | null>
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  readonly stdin: NodeJS.WritableStream
  /** Terminates the child — the escalation path ('SIGKILL' in this backend, as upstream). */
  readonly kill: (signal?: NodeJS.Signals) => void
}

/** The runner service shape — see the module doc for the three invocation contracts. */
export interface CommandRunnerService {
  /** `msb <args>` to completion: line-drained output, exit-code result, rejection only on spawn failure/timeout. */
  readonly invoke: (args: readonly string[], timeoutMs: number) => Effect.Effect<ExecResult, BackendError>
  /** The plain-Promise twin of `invoke`, for stream drivers that live outside Effect territory (the follow-logs watchdog). */
  readonly invokePromise: (args: readonly string[], timeoutMs: number) => Promise<ExecResult>
  /** One invocation's stdout byte-exact (CRLF→LF, trailing newline preserved); rejects on non-zero exit. */
  readonly fetchStdoutExact: (args: readonly string[], timeoutMs: number) => Effect.Effect<string, BackendError>
  /** A raw child for stream consumers — closed unless `stdin: 'pipe'` (the tunnel's bridge). */
  readonly spawn: (
    args: readonly string[],
    options?: { readonly stdin?: 'ignore' | 'pipe' },
  ) => Effect.Effect<CliChild, BackendError>
  /** Synchronous best-effort invocation (the process-exit cleanup path); failures swallowed. */
  readonly spawnSync: (args: readonly string[]) => void
}

/**

// ---------------------------------------------------------------------------
// Promise plumbing — native timers are forbidden in files that import
// effect, so a spawn timeout is an Effect race against `Effect.sleep`
// (TestClock-compatible) and every promise is `Promise.withResolvers`.
// ---------------------------------------------------------------------------

/** The child's exit code, observed via the process's own 'exit' event. */
function childExitCode(child: ChildProcess): Promise<number | null> {
  const { promise, resolve } = Promise.withResolvers<number | null>()
  child.once('exit', (code) => resolve(code ?? null))
  return promise
}

/** The child's spawn failure, observed via 'error' (fires instead of 'exit' when the binary cannot launch). */
function childSpawnError(child: ChildProcess): Promise<Error> {
  const { promise, resolve } = Promise.withResolvers<Error>()
  child.once('error', (err) => resolve(err))
  return promise
}

/** Drains a stream line-by-line into `onLine`, resolving when the stream closes. */
function drainLines(stream: NodeJS.ReadableStream, onLine: (line: string) => void): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  rl.on('line', onLine)
  rl.on('close', () => resolve())
  return promise
}

/** A child-process invocation's terminal outcome: exited, failed to spawn, or killed by the timeout budget. */
export type ExitOutcome =
  | { readonly _tag: 'code'; readonly code: number | null }
  | { readonly _tag: 'spawn-error'; readonly error: Error }
  | { readonly _tag: 'timeout' }

/** Races 'exit', 'error', and the timeout budget. The caller owns the kill on 'timeout'. */
export function exitOutcome(child: ChildProcess, timeoutMs: number): Effect.Effect<ExitOutcome> {
  return Effect.raceAll([
    Effect.promise(() => childExitCode(child)).pipe(Effect.map((code): ExitOutcome => ({ _tag: 'code', code }))),
    Effect.promise(() => childSpawnError(child)).pipe(
      Effect.map((error): ExitOutcome => ({ _tag: 'spawn-error', error })),
    ),
    Effect.sleep(timeoutMs).pipe(Effect.as({ _tag: 'timeout' } as const)),
  ])
}

/** The awaited union result of `invoke` — the drains and outcome combined by the caller's Match. */
function timeoutFailure(args: readonly string[], timeoutMs: number): BackendError {
  return BackendError.make({
    message: `msb ${args.join(' ')} timed out after ${timeoutMs}ms and was force-killed — the msb daemon may be ` +
      `overloaded or unresponsive; retry, or check 'msb' directly`,
  })
}

/**
 * The live runner over a concrete msb binary path. Every method is a plain
 * function of `msbPath`; the adapter layer supplies it via the provisioner.
 */
export function createCommandRunner(msbPath: string): CommandRunnerService {
  const invoke = (args: readonly string[], timeoutMs: number): Effect.Effect<ExecResult, BackendError> =>
    Effect.gen(function*() {
      const child = spawn(msbPath, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
      const stdoutLines: string[] = []
      const stderrLines: string[] = []
      // Drains run from the moment of spawn; the result resolves on top of
      // them so an early exit's buffered output is never lost.
      const stdoutDone = drainLines(child.stdout, (line) => stdoutLines.push(line))
      const stderrDone = drainLines(child.stderr, (line) => stderrLines.push(line))

      const outcome = yield* exitOutcome(child, timeoutMs)
      const result = Match.value(outcome).pipe(
        Match.tag('timeout', () => Effect.fail(timeoutFailure(args, timeoutMs))),
        Match.tag(
          'spawn-error',
          ({ error }) =>
            Effect.fail(BackendError.make({ message: `failed to spawn 'msb ${args.join(' ')}': ${error.message}` })),
        ),
        Match.tag('code', ({ code }) =>
          Effect.gen(function*() {
            // The child has exited; the drains settle right after the
            // streams flush, so large exec output is never truncated by a
            // fixed deadline.
            yield* Effect.promise(() => stdoutDone)
            yield* Effect.promise(() => stderrDone)
            return {
              exitCode: code ?? -1,
              stdout: stdoutLines.join('\n') + (stdoutLines.length > 0 ? '\n' : ''),
              stderr: stderrLines.join('\n') + (stderrLines.length > 0 ? '\n' : ''),
            }
          })),
        Match.exhaustive,
      )
      return yield* result
    })

  const fetchStdoutExact = (args: readonly string[], timeoutMs: number): Effect.Effect<string, BackendError> =>
    Effect.gen(function*() {
      const child = spawn(msbPath, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      const outcome = yield* exitOutcome(child, timeoutMs)
      const result = Match.value(outcome).pipe(
        Match.tag('timeout', () => Effect.fail(timeoutFailure(args, timeoutMs))),
        Match.tag(
          'spawn-error',
          ({ error }) =>
            Effect.fail(BackendError.make({ message: `failed to spawn 'msb ${args.join(' ')}': ${error.message}` })),
        ),
        Match.tag('code', ({ code }) => {
          if (code !== 0) {
            return Effect.fail(
              BackendError.make({ message: `msb ${args.join(' ')} exited ${code ?? 'unknown'}: ${stderr.trim()}` }),
            )
          }
          return Effect.succeed(stdout.replace(/\r\n/g, '\n'))
        }),
        Match.exhaustive,
      )
      return yield* result
    })

  const spawnEffect = (
    args: readonly string[],
    options: { readonly stdin?: 'ignore' | 'pipe' } = {},
  ): Effect.Effect<CliChild, BackendError> =>
    Effect.sync(() => {
      // `msb exec` (and empirically `msb run`/`logs`/`ls` too) forwards a
      // held-open stdin pipe and blocks on EOF, so closed stdin is the
      // default; only the tunnel bridges the guest's stdin and opts in.
      const child: ChildProcess = spawn(msbPath, [...args], {
        stdio: [options.stdin ?? 'ignore', 'pipe', 'pipe'],
      })
      const streams = {
        stdout: child.stdout,
        stderr: child.stderr,
        stdin: child.stdin,
      }
      // 'pipe' stdio makes all three non-null by construction; the guard
      // exists for the type system, and any null here is a Node change.
      if (streams.stdout === null || streams.stderr === null || streams.stdin === null) {
        throw new Error(`msb child for '${args.join(' ')}' produced a null stdio stream despite 'pipe'`)
      }
      return {
        exited: childExitCode(child),
        stdout: streams.stdout,
        stderr: streams.stderr,
        stdin: streams.stdin,
        kill: (signal?: NodeJS.Signals) => {
          child.kill(signal)
        },
      }
    })

  const invokeSync = (args: readonly string[]): void => {
    try {
      spawnSync(msbPath, [...args])
    } catch {
      // Best-effort: the process is exiting regardless; there is no caller
      // left to report to.
    }
  }

  const invokePromise = (args: readonly string[], timeoutMs: number): Promise<ExecResult> =>
    Effect.runPromise(invoke(args, timeoutMs))

  return { invoke, fetchStdoutExact, spawn: spawnEffect, spawnSync: invokeSync, invokePromise }
}
