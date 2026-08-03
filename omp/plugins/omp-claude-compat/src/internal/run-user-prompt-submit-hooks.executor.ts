import type { InputEventResult } from '@oh-my-pi/pi-coding-agent'
import { sessionIds } from '@systemfsoftware/omp-utils'
import { Context, Effect, Either, Match, type Scope } from 'effect'
import { drainAsyncHookContext } from '../async-hook-output.state.js'
import type { HookSettings } from '../hook-settings.acl.js'
import { InterpretHookCommand, interpretHookResult } from '../hook-verdict.workflow.js'
import { isHostBound } from '../prompt-destination.kernel.js'
import type { HookPrompt, HookSession } from './hook-session.kernel.js'
import { runHookScript } from './run-hook-script.executor.js'

export class RunUserPromptSubmitHooksExecutorDeps extends Context.Tag('RunUserPromptSubmitHooksExecutorDeps')<
  RunUserPromptSubmitHooksExecutorDeps,
  Scope.Scope
>() {}

export const runUserPromptSubmitHooks = Effect.fn('runUserPromptSubmitHooks')(function*(
  settings: HookSettings,
  event: HookPrompt,
  ctx: HookSession,
) {
  const entries = settings.hooks.UserPromptSubmit
  const cwd = ctx.cwd
  const hostBound = isHostBound(event.text)
  // Left undrained for a host-bound prompt: an async note is one-shot, so it
  // has to survive this command and reach the next model-bound prompt.
  const pending = Match.value(hostBound).pipe(
    Match.when(true, (): ReadonlyArray<string> => []),
    Match.when(false, () => drainAsyncHookContext()),
    Match.exhaustive,
  )
  const stdouts: string[] = []
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    prompt: event.text,
    source: event.source,
  }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      const result = yield* runHookScript(hook, input, cwd, 'UserPromptSubmit')

      // Claude Code rejects the prompt on exit 2 or `decision: "block"`, feeding
      // the reason back rather than injecting stdout as context.
      const blockReason = Either.match(
        interpretHookResult(new InterpretHookCommand({ result, event: 'UserPromptSubmit' })),
        {
          onLeft: () => undefined,
          onRight: (decision) =>
            Match.value(decision).pipe(
              Match.tag('Block', (b) => b.reason),
              Match.orElse(() => undefined),
            ),
        },
      )
      if (blockReason !== undefined) {
        ctx.ui.notify(`Prompt blocked by UserPromptSubmit hook: ${blockReason}`, 'error')
        return { handled: true } satisfies InputEventResult
      }

      if (result.code !== 0) continue

      const stdout = result.stdout.trim()
      if (stdout.length > 0) {
        stdouts.push(stdout)
      }
    }
  }

  const deliver = (): InputEventResult | undefined => {
    const injected = [...pending, ...stdouts].join('\n\n')
    if (injected.length === 0) return undefined

    const delivered: InputEventResult = {
      text: `${injected}\n\n${event.text}`,
    }
    if (event.images !== undefined) {
      delivered.images = event.images
    }
    return delivered
  }

  // The hooks still ran, so a block still blocks; only the context is dropped.
  // Re-holding this run's stdout would duplicate it — unlike an async note,
  // these hooks re-run on the next prompt and produce it fresh.
  return Match.value(hostBound).pipe(
    Match.when(true, () => undefined),
    Match.when(false, deliver),
    Match.exhaustive,
  )
})
