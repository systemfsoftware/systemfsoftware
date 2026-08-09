import { Command } from '@effect/platform'
import { CommandExecutor } from '@effect/platform/CommandExecutor'
import { Context, Effect, Schema as S, type Scope, Stream } from 'effect'
import { detachIn } from '../deadline.policy.js'
import type { HookResult } from '../hook-dispatcher.schema.js'
import type { CommandHook } from '../hook-settings.acl.js'

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

const ToolInputRecord = S.Record({ key: S.String, value: S.Unknown })

/** The hook payload's wire contract, declared once and used in both directions. */
const encodeHookPayload = S.encodeSync(S.parseJson(ToolInputRecord))

export class RunHookScriptExecutorDeps extends Context.Tag('RunHookScriptExecutorDeps')<
  RunHookScriptExecutorDeps,
  Scope.Scope
>() {}

export const runHookScript = Effect.fn('runHookScript')(function*(
  hook: CommandHook,
  input: Record<string, unknown>,
  cwd: string,
  event: string,
  callerIsWaiting: boolean = true,
) {
  const executor = yield* CommandExecutor
  const { timeoutMs, capNote } = resolveHookBudget(hook.timeout, event, callerIsWaiting)
  const stdinText = encodeHookPayload(input)

  // `args` selects the exec form: spawn the binary directly so no shell ever
  // interprets the command or its arguments. Otherwise the hook picks its own
  // interpreter, and running a bash hook under `sh` silently changes its
  // meaning wherever /bin/sh is not bash.
  const [shell, evalFlag] = SHELL_INVOCATION[hook.shell ?? 'sh']
  const base = hook.args === undefined
    ? Command.make(shell, evalFlag, hook.command)
    : Command.make(hook.command, ...hook.args)

  const hookCommand = base.pipe(
    Command.workingDirectory(cwd),
    Command.env({ OMP_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd }),
    Command.feed(stdinText),
    Command.stdout('pipe'),
    Command.stderr('pipe'),
  )

  // Detached whole: the stdout/stderr drain travels with the child, so
  // abandoning the wait never leaves it writing into a pipe nobody reads.
  const hookScope = yield* RunHookScriptExecutorDeps
  const run = Effect.scoped(
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function*() {
        const process = yield* executor.start(hookCommand)

        yield* Effect.addFinalizer(() =>
          Effect.interruptible(process.kill('SIGKILL')).pipe(
            Effect.timeout(KILL_GRACE_MS),
            Effect.ignore,
          )
        )

        const [stdout, stderr, code] = yield* restore(
          Effect.all(
            [
              process.stdout.pipe(Stream.decodeText(), Stream.mkString),
              process.stderr.pipe(Stream.decodeText(), Stream.mkString),
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
    Effect.tapErrorCause((cause) => Effect.logWarning(`hook ${hook.command} failed`, cause)),
  )

  return yield* detachIn(run, hookScope, {
    deadline: timeoutMs,
    onDeadline: () => ({ code: -1, stdout: '', stderr: `timeout after ${timeoutMs}ms${capNote}` }),
  })
})
