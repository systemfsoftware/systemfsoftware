import { Cell } from '@systemfsoftware/effect-cell-types'
import { matchesMatcher, matchesPermissionRule } from '@systemfsoftware/omp-utils'
import { Context, Effect, Match, Option, pipe, Result, Schema as S, type Scope } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { Blocked, Continue, Warning } from '../hook-dispatcher.schema.js'
import type { HookDecision, HookOutcome, HookResult } from '../hook-dispatcher.schema.js'
import { analyzeSettings } from '../hook-settings.acl.js'
import type { CommandHook, HookEntry } from '../hook-settings.acl.js'
import { type HookVerdictError, InterpretHookCommand, interpretHookResult } from '../hook-verdict.workflow.js'
import type { HooksForEventResult } from './hook-feedback.kernel.js'
import { asToolInput, EMPTY_TOOL_INPUT } from './hook-payload.kernel.js'
import type { HookSession } from './hook-session.kernel.js'
import { runHookScript, type RunHookScriptExecutorDeps } from './run-hook-script.executor.js'
import { superviseFork } from './supervise-fork.executor.js'

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
  readonly decoded: InterpretHookCommand
  readonly decision: HookDecision
  readonly decisionError: HookVerdictError
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
  const matcherUnreadable = analyzeSettings({ _tag: 'MatcherUnreadable', event }, S.Boolean)

  /**
   * The verdict chain, as a description applied per hook iteration. The read
   * is the hook script run; `decode` wraps the raw result for the workflow;
   * `interpretHookResult` is the decision; `encode` folds the decision's two
   * channels into the outcome the site acts on; `write` sequences the loop —
   * a block returns the terminal result, a continue accumulates state. The
   * write's `currentInput` and `warning` are the same mutable loop state the
   * shell updated, so each iteration's command carries the input the previous
   * write produced.
   */
  const hookVerdictDescription = pipe(
    Cell.read<HookVerdictPhases>(({ hook, input }) => runHookScript(hook, input, cwd, event)),
    Cell.decode<HookVerdictPhases>((raw) => Result.succeed(new InterpretHookCommand({ result: raw, event }))),
    Cell.decide<HookVerdictPhases>(interpretHookResult),
    Cell.encode<HookVerdictPhases>((outcome) =>
      Match.value(
        Result.match(outcome, {
          onFailure: (err) =>
            new Warning({ message: `Hook exited 0 but produced invalid JSON: ${err.raw.slice(0, 200)}` }),
          onSuccess: (d) => d,
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
    if (matcherUnreadable && entry.matcher !== undefined) continue
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) {
        // `if` is a permission rule over a tool call, so only a tool event can
        // satisfy one. Elsewhere a hook that sets `if` never runs.
        if (!analyzeSettings({ _tag: 'IfEvaluatingEvent', event }, S.Boolean)) continue
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
