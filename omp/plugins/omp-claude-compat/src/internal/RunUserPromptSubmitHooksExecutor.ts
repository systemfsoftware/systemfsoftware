import type { InputEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Exit, Match, Option, pipe, Result, type Scope } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { drainAsyncHookContext } from '../AsyncHookOutput.js'
import type { HookResult } from '../HookDispatcher.schema.js'
import { parseHookOutput } from '../HookOutput.js'
import type { CommandHook, HookSettings } from '../HookSettings.schema.js'
import {
  type HookDecision,
  InterpretHookCommand,
  type SubmitHookVerdictError,
  submitVerdict,
  SubmitVerdictCommand,
} from '../HookVerdict.workflow.js'
import { isHostBound } from '../PromptDestination.js'
import { sessionIds } from '../wire/Session.js'
import type { HookPrompt, HookSession } from './HookSession.js'
import { runHookScript } from './RunHookScriptExecutor.js'

/**
 * The per-hook prompt-submission chain, in one bag so the phase order is
 * carried by types: run the hook script (read), wrap the raw result for the
 * workflow while carrying the raw's code and stdout forward (decode),
 * interpret it (decide), fold both channels into the block decision (encode),
 * and act on it (write). The workflow's `Left` — a malformed decision JSON —
 * folds to `blockReason: undefined`, so it reaches the write as a value rather
 * than a failure.
 */
interface SubmitPhases extends Cell.Phases {
  readonly command: { readonly hook: CommandHook; readonly input: Record<string, unknown> }
  readonly raw: HookResult
  readonly decoded: SubmitVerdictCommand
  readonly decision: { readonly verdict: HookDecision; readonly code: number; readonly stdout: string }
  readonly decisionError: SubmitHookVerdictError
  readonly output: { readonly blockReason: string | undefined; readonly code: number; readonly stdout: string }
  readonly response: Option.Option<InputEventResult>
  readonly decodeError: never
  readonly readError: PlatformError
  readonly writeError: never
  readonly readContext: ChildProcessSpawner | Scope.Scope
  readonly writeContext: never
}

/** @internal */
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
    Match.when(true, (): readonly string[] => []),
    Match.when(false, () => drainAsyncHookContext()),
    Match.exhaustive,
  )
  const stdouts: string[] = []
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    prompt: event.text,
    source: event.source,
  }

  /**
   * The prompt-submission verdict chain, as a description applied per hook
   * iteration. The read is the hook script run; `decode` wraps the raw result
   * for the workflow, hoists the stdout parse, and carries the raw's code and
   * stdout forward, because the write still needs them; `submitVerdict` is the
   * decision, with both channels carrying that forward context; `encode` folds
   * the decision into the block reason; `write` blocks with a notify, skips
   * failed hooks, or accumulates the trimmed stdout.
   */
  const submitDescription = pipe(
    Cell.read<SubmitPhases>(({ hook, input }) => runHookScript(hook, input, cwd, 'UserPromptSubmit')),
    Cell.decode<SubmitPhases>((raw) =>
      Result.succeed(
        new SubmitVerdictCommand({
          cmd: new InterpretHookCommand({
            result: raw,
            event: 'UserPromptSubmit',
            parsed: Exit.match(parseHookOutput(raw.stdout), {
              onFailure: () => Option.none(),
              onSuccess: Option.some,
            }),
          }),
          code: raw.code,
          stdout: raw.stdout,
        }),
      )
    ),
    Cell.decide<SubmitPhases>(submitVerdict),
    Cell.encode<SubmitPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: ({ code, stdout }) => ({ blockReason: undefined, code, stdout }),
        onSuccess: ({ verdict, code, stdout }) => ({
          blockReason: Match.value(verdict).pipe(
            Match.tag('Block', (b) => b.reason),
            Match.orElse(() => undefined),
          ),
          code,
          stdout,
        }),
      })
    ),
    Cell.write<SubmitPhases>(({ blockReason, code, stdout }) =>
      Effect.sync(() => {
        // Claude Code rejects the prompt on exit 2 or `decision: "block"`, feeding
        // the reason back rather than injecting stdout as context.
        if (blockReason !== undefined) {
          ctx.ui.notify(`Prompt blocked by UserPromptSubmit hook: ${blockReason}`, 'error')
          return Option.some({ handled: true } satisfies InputEventResult)
        }
        if (code !== 0) return Option.none()
        const trimmed = stdout.trim()
        if (trimmed.length > 0) {
          stdouts.push(trimmed)
        }
        return Option.none()
      })
    ),
  )

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      const exit = yield* Cell.apply(submitDescription, { hook, input })
      if (Option.isSome(exit)) return exit.value
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
