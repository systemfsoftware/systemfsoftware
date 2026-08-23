import { Cell } from '@systemfsoftware/effect-cell-types'
import { matchesMatcher, matchesPermissionRule } from '@systemfsoftware/omp-utils'
import { Context, Effect, Exit, Match, Option, pipe, Result, type Scope } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { Blocked, Continue } from '../HookDispatcher.schema.js'
import type { HookOutcome, HookResult } from '../HookDispatcher.schema.js'
import { parseHookOutput } from '../HookOutput.js'
import { ifEvaluatingEvent, matcherUnreadable } from '../HookSettings.js'
import type { CommandHook, HookEntry } from '../HookSettings.schema.js'
import {
  type HookDecision,
  InterpretHookCommand,
  type SubmitHookVerdictError,
  submitVerdict,
  SubmitVerdictCommand,
  Warning,
} from '../HookVerdict.workflow.js'
import type { HooksForEventResult } from './HookFeedback.js'
import { asToolInput, EMPTY_TOOL_INPUT } from './HookPayload.js'
import type { HookSession } from './HookSession.js'
import { runHookScript, type RunHookScriptExecutorDeps } from './RunHookScriptExecutor.js'
import { superviseFork } from './SuperviseForkExecutor.js'

/** @internal */
export class RunHooksForEventExecutorDeps extends Context.Service<RunHooksForEventExecutorDeps, Scope.Scope>()(
  'RunHooksForEventExecutorDeps',
) {}

const AGGREGATE_CEILING_MS = 26_000

/**
 * The per-hook verdict chain, in one bag so the phase order is carried by
 * types: run the hook script (read), wrap the raw result for the workflow
 * (decode), interpret it (decide), fold both channels into the outcome the
 * site acts on (encode), and sequence the loop from that outcome (write).
 * The workflow's `Left` — a malformed decision JSON — is folded into a
 * `Warning` outcome by `encode`, so it reaches the write as a value rather than
 * a failure.
 */
interface HookVerdictPhases extends Cell.Phases {
  readonly command: { readonly hook: CommandHook; readonly input: Record<string, unknown> }
  readonly raw: HookResult
  readonly decoded: SubmitVerdictCommand
  readonly decision: { readonly verdict: HookDecision; readonly code: number; readonly stdout: string }
  readonly decisionError: SubmitHookVerdictError
  readonly output: HookOutcome
  readonly response: Option.Option<HooksForEventResult>
  readonly decodeError: never
  readonly readError: PlatformError
  readonly writeError: never
  readonly readContext: ChildProcessSpawner | RunHookScriptExecutorDeps
  readonly writeContext: never
}
const runHooksForEventUnbounded = Effect.fn('runHooksForEventUnbounded')(function*(
  entries: readonly HookEntry[],
  matchValue: string,
  input: Record<string, unknown>,
  ctx: HookSession,
  event: string,
) {
  const cwd = ctx.cwd
  const ruleInput = Option.getOrElse(asToolInput(input['tool_input']), () => EMPTY_TOOL_INPUT)
  let warning: string | undefined
  let currentInput = input
  // A matcher this event cannot evaluate must not behave as a match. U3 already
  // named the hook at session start, so this is a silent skip, not a report.
  const unreadableMatcher = matcherUnreadable(event)

  /**
   * The verdict chain, as a description applied per hook iteration. The read
   * is the hook script run; `decode` wraps the raw result for the workflow and
   * threads the raw's code and stdout forward; `submitVerdict` is the decision;
   * `encode` folds the decision's two channels into the outcome the site acts
   * on; `write` sequences the loop — a block returns the terminal result, a
   * continue accumulates state. The write's `currentInput` and `warning` are
   * the same mutable loop state the shell updated, so each iteration's command
   * carries the input the previous write produced.
   */
  const hookVerdictDescription = pipe(
    Cell.read<HookVerdictPhases>(({ hook, input }) => runHookScript(hook, input, cwd, event)),
    Cell.decode<HookVerdictPhases>((raw) =>
      Result.succeed(
        new SubmitVerdictCommand({
          cmd: new InterpretHookCommand({
            result: raw,
            event,
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
    Cell.decide<HookVerdictPhases>(submitVerdict),
    Cell.encode<HookVerdictPhases>((outcome) =>
      Match.value(
        Result.match(outcome, {
          onFailure: ({ error }) =>
            new Warning({ message: `Hook exited 0 but produced invalid JSON: ${error.raw.slice(0, 200)}` }),
          onSuccess: ({ verdict }) => verdict,
        }),
      ).pipe(
        Match.tag('Block', (d) => new Blocked({ reason: d.reason })),
        Match.tag('Warning', (d) => new Continue({ warning: d.message })),
        Match.tag('Allow', (d) => new Continue({ updatedInput: d.updatedInput })),
        Match.exhaustive,
      )
    ),
    Cell.write<HookVerdictPhases>((outcome) =>
      Effect.sync(() =>
        Match.value(outcome).pipe(
          Match.tag('Blocked', (b) => Option.some({ block: true as const, reason: b.reason })),
          Match.tag('Continue', (c) => {
            if (c.warning !== undefined && warning === undefined) warning = c.warning
            if (c.updatedInput !== undefined) {
              currentInput = { ...currentInput, ...c.updatedInput }
            }
            return Option.none()
          }),
          Match.exhaustive,
        )
      )
    ),
  )

  for (const entry of entries) {
    if (unreadableMatcher && entry.matcher !== undefined) continue
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) {
        // `if` is a permission rule over a tool call, so only a tool event can
        // satisfy one. Elsewhere a hook that sets `if` never runs.
        if (!ifEvaluatingEvent(event)) continue
        if (!matchesPermissionRule(hook.if, matchValue, ruleInput, cwd)) continue
      }
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDetach(
          superviseFork(runHookScript(hook, currentInput, cwd, event, false), ctx, hook.command),
        )
        continue
      }

      const exit = yield* Cell.apply(hookVerdictDescription, { hook, input: currentInput })
      if (Option.isSome(exit)) return exit.value
    }
  }

  return {
    ...(currentInput === input ? {} : { updatedInput: currentInput }),
    ...(warning !== undefined ? { warning } : {}),
  } satisfies HooksForEventResult
})

/** @internal */
export const runHooksForEvent = Effect.fn('runHooksForEvent')(function*(
  entries: readonly HookEntry[],
  matchValue: string,
  input: Record<string, unknown>,
  ctx: HookSession,
  event: string,
) {
  return yield* runHooksForEventUnbounded(entries, matchValue, input, ctx, event).pipe(
    Effect.timeout(AGGREGATE_CEILING_MS),
    Effect.catchTag('TimeoutError', (): Effect.Effect<HooksForEventResult> => Effect.succeed({})),
  )
})
