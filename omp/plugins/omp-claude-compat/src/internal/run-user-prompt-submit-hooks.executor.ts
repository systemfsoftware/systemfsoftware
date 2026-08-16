import type { InputEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import { sessionIds } from '@systemfsoftware/omp-utils'
import { Context, Effect, Match, Option, pipe, Result, type Scope } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import * as S from 'effect/Schema'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { drainAsyncHookContext } from '../async-hook-output.state.js'
import type { HookDecision, HookResult } from '../hook-dispatcher.schema.js'
import type { CommandHook, HookSettings } from '../hook-settings.acl.js'
import { HookVerdictError, InterpretHookCommand, interpretHookResult } from '../hook-verdict.workflow.js'
import { isHostBound } from '../prompt-destination.kernel.js'
import type { HookPrompt, HookSession } from './hook-session.kernel.js'
import { runHookScript, type RunHookScriptExecutorDeps } from './run-hook-script.executor.js'

export class RunUserPromptSubmitHooksExecutorDeps extends Context.Service<
  RunUserPromptSubmitHooksExecutorDeps,
  Scope.Scope
>()('RunUserPromptSubmitHooksExecutorDeps') {}

/**
 * The submit decision's failure: the workflow's verdict error plus the raw's code and
 * stdout, as a schema-derived tagged struct — the error channel of a branded decide run
 * must carry a tag, and the struct derives one instead of declaring a `_tag` by hand.
 */
const SubmitHookVerdictError = S.TaggedStruct('SubmitHookVerdictError', {
  error: HookVerdictError,
  code: S.Finite,
  stdout: S.String,
})
type SubmitHookVerdictError = S.Schema.Type<typeof SubmitHookVerdictError>

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
  readonly decoded: { readonly cmd: InterpretHookCommand; readonly code: number; readonly stdout: string }
  readonly decision: { readonly verdict: HookDecision; readonly code: number; readonly stdout: string }
  readonly decisionError: SubmitHookVerdictError
  readonly output: { readonly blockReason: string | undefined; readonly code: number; readonly stdout: string }
  readonly response: Option.Option<InputEventResult>
  readonly decodeError: never
  readonly readError: PlatformError
  readonly writeError: never
  readonly readContext: ChildProcessSpawner | RunHookScriptExecutorDeps
  readonly writeContext: never
}

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
   * for the workflow and carries the raw's code and stdout forward, because
   * the write still needs them; `interpretHookResult` is the decision, with
   * both channels carrying that forward context; `encode` folds the decision
   * into the block reason; `write` blocks with a notify, skips failed hooks,
   * or accumulates the trimmed stdout.
   */
  const submitDescription = pipe(
    Cell.read<SubmitPhases>(({ hook, input }) => runHookScript(hook, input, cwd, 'UserPromptSubmit')),
    Cell.decode<SubmitPhases>((raw) =>
      Result.succeed({
        cmd: new InterpretHookCommand({ result: raw, event: 'UserPromptSubmit' }),
        code: raw.code,
        stdout: raw.stdout,
      })
    ),
    Cell.decide<SubmitPhases>(
      // Every decision must pass through `Workflow.make` before a description may run it;
      // this adapter maps the hook-verdict workflow's outcome into the submit outcome.
      Workflow.make(
        (
          { cmd, code, stdout }: SubmitPhases['decoded'],
        ): Result.Result<SubmitPhases['decision'], SubmitPhases['decisionError']> =>
          Result.mapBoth(interpretHookResult(cmd), {
            onFailure: (error) => SubmitHookVerdictError.make({ error, code, stdout }),
            onSuccess: (verdict) => ({ verdict, code, stdout }),
          }),
      ),
    ),
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
