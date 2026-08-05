import { matchesMatcher, matchesPermissionRule } from '@systemfsoftware/omp-utils'
import { Context, Effect, Either, Match, Option, Schema as S, type Scope } from 'effect'
import { Blocked, Continue, Warning } from '../hook-dispatcher.schema.js'
import type { HookOutcome } from '../hook-dispatcher.schema.js'
import { analyzeSettings } from '../hook-settings.acl.js'
import type { HookEntry } from '../hook-settings.acl.js'
import { InterpretHookCommand, interpretHookResult } from '../hook-verdict.workflow.js'
import type { HooksForEventResult } from './hook-feedback.kernel.js'
import { asToolInput, EMPTY_TOOL_INPUT } from './hook-payload.kernel.js'
import type { HookSession } from './hook-session.kernel.js'
import { runHookScript } from './run-hook-script.executor.js'
import { superviseFork } from './supervise-fork.executor.js'

export class RunHooksForEventExecutorDeps extends Context.Tag('RunHooksForEventExecutorDeps')<
  RunHooksForEventExecutorDeps,
  Scope.Scope
>() {}

const AGGREGATE_CEILING_MS = 26_000
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
        yield* Effect.forkDaemon(
          superviseFork(runHookScript(hook, currentInput, cwd, event, false), ctx, hook.command),
        )
        continue
      }

      const result = yield* runHookScript(hook, currentInput, cwd, event)

      const verdict = interpretHookResult(new InterpretHookCommand({ result, event }))
      const decision = Either.match(verdict, {
        onLeft: (err) =>
          Match.value(err).pipe(
            Match.tag('HookVerdictError', (e) =>
              new Warning({ message: `Hook exited 0 but produced invalid JSON: ${e.raw.slice(0, 200)}` })),
            Match.exhaustive,
          ),
        onRight: (d) => d,
      })

      const outcome: HookOutcome = Match.value(decision).pipe(
        Match.tag('Block', (d) => new Blocked({ reason: d.reason })),
        Match.tag('Warning', (d) => new Continue({ warning: d.message })),
        Match.tag('Allow', (d) => new Continue({ updatedInput: d.updatedInput })),
        Match.exhaustive,
      )

      // Sequence the loop from the outcome; arms perform the effects.
      const hookExit: Option.Option<HooksForEventResult> = Match.value(outcome).pipe(
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

      if (Option.isSome(hookExit)) return hookExit.value
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
    Effect.catchTag('TimeoutException', (): Effect.Effect<HooksForEventResult> => Effect.succeed({})),
  )
})
