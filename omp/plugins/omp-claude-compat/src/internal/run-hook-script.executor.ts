import { Context, Effect, Schema as S, type Scope, Stream } from 'effect'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { detachIn } from '../deadline.policy.js'
import type { HookResult } from '../hook-dispatcher.schema.js'
import type { CommandHook } from '../hook-settings.schema.js'
import { ToolInputRecord } from './hook-payload.schema.js'

const CLAUDE_EVENT_DEFAULT_SECONDS: Readonly<Record<string, number>> = {
  UserPromptSubmit: 30,
}

const CLAUDE_FALLBACK_SECONDS = 600

const requestedMs = (configuredSeconds: number | undefined, event: string): number =>
  (configuredSeconds ?? CLAUDE_EVENT_DEFAULT_SECONDS[event] ?? CLAUDE_FALLBACK_SECONDS) * 1000

const HOOK_CEILING_MS = 24_000
const KILL_GRACE_MS = 2_000

const resolveHookBudget = (
  configuredSeconds: number | undefined,
  event: string,
  callerIsWaiting: boolean,
): { timeoutMs: number; capNote: string } => {
  const raw = requestedMs(configuredSeconds, event)
  if (!callerIsWaiting || raw <= HOOK_CEILING_MS) {
    return { timeoutMs: raw, capNote: '' }
  }
  return { timeoutMs: HOOK_CEILING_MS, capNote: ` (capped from ${raw}ms by the extension handler budget)` }
}

const SHELL_INVOCATION = {
  sh: ['sh', '-c'],
  bash: ['bash', '-c'],
  powershell: ['powershell', '-Command'],
} as const satisfies Record<string, readonly [string, string]>

/** The hook payload's wire contract, declared once and used in both directions. */
const encodeHookPayload = S.encodeSync(S.fromJsonString(ToolInputRecord))

export class RunHookScriptExecutorDeps extends Context.Service<RunHookScriptExecutorDeps, Scope.Scope>()(
  'RunHookScriptExecutorDeps',
) {}

export const runHookScript = Effect.fn('runHookScript')(function*(
  hook: CommandHook,
  input: Record<string, unknown>,
  cwd: string,
  event: string,
  callerIsWaiting: boolean = true,
) {
  const executor = yield* ChildProcessSpawner
  const { timeoutMs, capNote } = resolveHookBudget(hook.timeout, event, callerIsWaiting)
  const stdinText = encodeHookPayload(input)

  // `args` selects the exec form: spawn the binary directly so no shell ever
  // interprets the command or its arguments. Otherwise the hook picks its own
  // interpreter, and running a bash hook under `sh` silently changes its
  // meaning wherever /bin/sh is not bash.
  const [shell, evalFlag] = SHELL_INVOCATION[hook.shell ?? 'sh']
  const options = {
    cwd,
    env: { OMP_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd },
    stdin: Stream.fromIterable([new TextEncoder().encode(stdinText)]),
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  }
  const hookCommand = hook.args === undefined
    ? ChildProcess.make(shell, [evalFlag, hook.command], options)
    : ChildProcess.make(hook.command, hook.args, options)

  // Detached whole: the stdout/stderr drain travels with the child, so
  // abandoning the wait never leaves it writing into a pipe nobody reads.
  const hookScope = yield* RunHookScriptExecutorDeps
  const run = Effect.scoped(
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function*() {
        const process = yield* executor.spawn(hookCommand)

        yield* Effect.addFinalizer(() =>
          Effect.interruptible(process.kill({ killSignal: 'SIGKILL' })).pipe(
            Effect.timeout(KILL_GRACE_MS),
            Effect.ignore,
          )
        )

        const [stdout, stderr, code] = yield* restore(
          Effect.all(
            [
              Stream.mkString(Stream.decodeText(process.stdout)),
              Stream.mkString(Stream.decodeText(process.stderr)),
              process.exitCode.pipe(Effect.map(Number), Effect.orElseSucceed(() => -1)),
            ],
            { concurrency: 'unbounded' },
          ),
        )

        return { code, stdout, stderr } satisfies HookResult
      })
    ),
  ).pipe(
    // Past the deadline no joiner is left to surface a failure.
    Effect.tapCause((cause) => Effect.logWarning(`hook ${hook.command} failed`, cause)),
  )

  return yield* detachIn(run, hookScope, {
    deadline: timeoutMs,
    onDeadline: () => ({ code: -1, stdout: '', stderr: `timeout after ${timeoutMs}ms${capNote}` }),
  })
})
