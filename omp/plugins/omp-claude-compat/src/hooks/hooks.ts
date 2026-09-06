import type {
  ExtensionAPI,
  InputEvent,
  InputEventResult,
  ToolCallEvent,
  ToolCallEventResult,
  ToolResultEvent,
  ToolResultEventResult,
} from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import {
  Array as Arr,
  Cause,
  Duration,
  Effect,
  Exit,
  Fiber,
  Match,
  Option,
  Ref,
  Result,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { LazyArg } from 'effect/Function'
import type { PlatformError } from 'effect/PlatformError'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { homedir } from 'node:os'
import { ClaudeSettings, ifEvaluatingEvent, matcherUnreadable } from '../settings/mod.js'
import type { CommandHook, HookEntry, HookSettings } from '../settings/mod.js'

import {
  AdmitHooksCommand,
  Blocked,
  Continue,
  HookOutputFromStdout,
  HookResult,
  RunHooks,
  SkipHooks,
} from './hooks.schema.js'
import type {
  AdmitCommand,
  HookDispatchDecision,
  HookPrompt,
  HookSession,
  HookToolCall,
  HookToolResult,
} from './hooks.schema.js'

export const admitLoadedSettings = (command: AdmitCommand): HookDispatchDecision =>
  Match.value(command.present).pipe(
    Match.when(true, () => new RunHooks()),
    Match.when(false, () => new SkipHooks()),
    Match.exhaustive,
  )
import { InterpretHookCommand, interpretHookResult, Warning } from './interpret-hook-result.workflow.js'
import {
  denormalizeToolInput,
  editTargetPaths,
  extractShellCommand,
  matchesMatcher,
  matchesPermissionRule,
  normalizeToolInput,
  normalizeToolName,
  sessionIds,
} from './wire.js'
import { ToolInputRecord } from './wire.schema.js'

export const skipHooks = (): HookDispatchDecision => new SkipHooks()
export const admitPresent = (present: boolean): AdmitCommand => new AdmitHooksCommand({ present })

const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)

const HOST_COMMAND_PREFIXES: readonly string[] = [
  '/',
  '!',
  '->',
  '=>',
  '$ ',
  '$\t',
  '$\n',
  '$\r',
  '$$ ',
  '$$\t',
  '$$\n',
  '$$\r',
]

const isHostBound = (text: string): boolean =>
  HOST_COMMAND_PREFIXES.some((prefix) => `${text.trimStart()} `.startsWith(prefix))

const PENDING_CAP = 64

const pending: Ref.Ref<string[]> = Ref.makeUnsafe<string[]>([])

const recordAsyncHookContext = (context: string): void => {
  const text = context.trim()
  if (text.length === 0) return
  Effect.runSync(
    Ref.update(pending, (items) => items.length >= PENDING_CAP ? [...items.slice(1), text] : [...items, text]),
  )
}

const drainAsyncHookContext = (): readonly string[] => Effect.runSync(Ref.getAndSet(pending, []))

export const detachIn = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  scope: Scope.Scope,
  options: {
    readonly deadline: Duration.Input
    readonly onDeadline: LazyArg<A>
  },
): Effect.Effect<A, E, R> =>
  Effect.forkIn(self, scope).pipe(
    Effect.flatMap((fiber) => Fiber.join(fiber)),
    Effect.timeoutOption(options.deadline),
    Effect.map((result) => Option.getOrElse(result, options.onDeadline)),
  )

const onGaveUp: LazyArg<string> = () => 'gave-up'

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Effect, Exit, Fiber, Ref, Scope } = await import('effect')
  const { FastCheck: fc, TestClock } = await import('effect/testing')

  const budget = { fastCheck: { numRuns: 25 }, timeout: 30_000 }

  const within = (max: number) => S.toArbitrary(S.Int)(fc).filter((n) => n >= 1 && n <= max)
  const deadlineMs = within(10_000)

  const overrunMs = within(10_000)

  const deadlineWithUnderrun = deadlineMs.chain((deadline) =>
    S.toArbitrary(S.Int)(fc).filter((n) => n >= 0 && n < deadline).map((workMillis) => [deadline, workMillis] as const)
  )

  const workTaking = (millis: number) =>
    Effect.gen(function*() {
      const done = yield* Ref.make(false)
      const interrupted = yield* Ref.make(false)
      const work = Effect.sleep(millis).pipe(
        Effect.andThen(Ref.set(done, true)),
        Effect.as('finished'),
        Effect.onInterrupt(() => Ref.set(interrupted, true)),
      )
      return { done, interrupted, work }
    })

  const detachedFor = (deadline: number, workMillis: number) =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { done, interrupted, work } = yield* workTaking(workMillis)
      const caller = yield* Effect.forkChild(
        detachIn(work, scope, { deadline, onDeadline: onGaveUp }),
      )
      return { scope, done, interrupted, caller }
    })

  it.effect.prop(
    '∀overrun_WorkOutrunningTheDeadline_→CallerGetsTheFallback',
    [deadlineMs, overrunMs],
    ([deadline, overrun]) =>
      Effect.gen(function*() {
        const { caller } = yield* detachedFor(deadline, deadline + overrun)
        yield* TestClock.adjust(deadline)
        return (yield* Fiber.join(caller)) === 'gave-up'
      }),
    budget,
  )

  it.effect.prop(
    '∀overrun_TheDeadlinePassing_→WorkNeitherFinishedNorInterrupted',
    [deadlineMs, overrunMs],
    ([deadline, overrun]) =>
      Effect.gen(function*() {
        const { done, interrupted, caller } = yield* detachedFor(deadline, deadline + overrun)
        yield* TestClock.adjust(deadline)
        yield* Fiber.join(caller)
        return !(yield* Ref.get(done)) && !(yield* Ref.get(interrupted))
      }),
    budget,
  )

  it.effect.prop(
    '∀overrun_AbandonedWorkLeftAlone_→StillCompletes',
    [deadlineMs, overrunMs],
    ([deadline, overrun]) =>
      Effect.gen(function*() {
        const { done, caller } = yield* detachedFor(deadline, deadline + overrun)
        yield* TestClock.adjust(deadline)
        yield* Fiber.join(caller)
        yield* TestClock.adjust(overrun)
        return (yield* Ref.get(done)) === true
      }),
    budget,
  )

  it.effect.prop(
    '∀overrun_ScopeClosingOnAbandonedWork_→InterruptedAndNeverCompletes',
    [deadlineMs, overrunMs],
    ([deadline, overrun]) =>
      Effect.gen(function*() {
        const { scope, done, interrupted, caller } = yield* detachedFor(deadline, deadline + overrun)
        yield* TestClock.adjust(deadline)
        yield* Fiber.join(caller)
        yield* Scope.close(scope, Exit.succeed(undefined))
        yield* TestClock.adjust(overrun)
        return (yield* Ref.get(interrupted)) === true && (yield* Ref.get(done)) === false
      }),
    budget,
  )

  it.effect.prop(
    '∀underrun_WorkBeatingTheDeadline_→CallerGetsTheWorkResult',
    [deadlineWithUnderrun],
    ([[deadline, workMillis]]) =>
      Effect.gen(function*() {
        const { caller } = yield* detachedFor(deadline, workMillis)
        yield* TestClock.adjust(workMillis)
        return (yield* Fiber.join(caller)) === 'finished'
      }),
    budget,
  )
}

export const EMPTY_TOOL_INPUT: Record<string, unknown> = {}

export const asToolInput = S.decodeUnknownOption(ToolInputRecord)

export interface HooksForEventResult {
  readonly block?: boolean
  readonly reason?: string
  readonly warning?: string
  readonly updatedInput?: Record<string, unknown>
}

export type FeedbackOnlyResult = Omit<HooksForEventResult, 'block' | 'reason'>

export const blockAsFeedback = (result: HooksForEventResult): FeedbackOnlyResult =>
  result.reason === undefined ? {} : { warning: result.reason }

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

const encodeHookPayload = S.encodeSync(S.fromJsonString(ToolInputRecord))

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

  const [shell, evalFlag] = SHELL_INVOCATION[hook.shell ?? 'sh']
  const pluginRoot = hook.pluginRoot
  const expand = (value: string) =>
    pluginRoot === undefined ? value : value.split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot)
  const options = {
    cwd,
    env: {
      OMP_PROJECT_DIR: cwd,
      CLAUDE_PROJECT_DIR: cwd,
      ...(pluginRoot === undefined ? {} : { CLAUDE_PLUGIN_ROOT: pluginRoot }),
    },
    extendEnv: true,
    stdin: Stream.fromIterable([new TextEncoder().encode(stdinText)]),
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  }
  const hookCommand = hook.args === undefined
    ? ChildProcess.make(shell, [evalFlag, expand(hook.command)], options)
    : ChildProcess.make(expand(hook.command), hook.args.map(expand), options)

  const hookScope = yield* Scope.Scope
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
    Effect.tapCause((cause) => Effect.logWarning(`hook ${hook.command} failed`, cause)),
  )

  return yield* detachIn(run, hookScope, {
    deadline: timeoutMs,
    onDeadline: () => ({ code: -1, stdout: '', stderr: `timeout after ${timeoutMs}ms${capNote}` }),
  })
})

export const superviseFork = <E, R>(
  hook: Effect.Effect<HookResult, E, R>,
  ctx: HookSession,
  command: string,
): Effect.Effect<void, never, R> =>
  hook.pipe(
    Effect.matchCause({
      onSuccess: (result) => {
        const decoded = parseHookOutput(result.stdout)
        if (Exit.isSuccess(decoded)) {
          const ctxText = decoded.value.hookSpecificOutput?.additionalContext
          if (ctxText !== undefined) recordAsyncHookContext(ctxText)
        }
      },
      onFailure: (cause) => {
        if (Cause.hasInterruptsOnly(cause)) return
        ctx.ui.notify(`Background hook failed: ${command}: ${Cause.pretty(cause).split('\n')[0]}`, 'error')
      },
    }),
  )

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

  const unreadableMatcher = matcherUnreadable(event)

  const hookVerdictCell = Cell.layer({
    read: ({ hook, input }: { readonly hook: CommandHook; readonly input: Record<string, unknown> }) =>
      runHookScript(hook, input, cwd, event),
    decode: (raw: HookResult) =>
      Result.succeed(
        new InterpretHookCommand({
          result: raw,
          event,
          parsed: Exit.match(parseHookOutput(raw.stdout), {
            onFailure: () => Option.none(),
            onSuccess: Option.some,
          }),
        }),
      ),
    decide: interpretHookResult,
    encode: (outcome) =>
      Match.value(
        Result.match(outcome, {
          onFailure: ({ error, code, stdout }) =>
            new Warning({
              message: `Hook exited 0 but produced invalid JSON: ${error.raw.slice(0, 200)}`,
              code,
              stdout,
            }),
          onSuccess: (verdict) => verdict,
        }),
      ).pipe(
        Match.tag('Block', (d) => new Blocked({ reason: d.reason })),
        Match.tag('Warning', (d) => new Continue({ warning: d.message })),
        Match.tag('Allow', (d) => new Continue({ updatedInput: d.updatedInput })),
        Match.exhaustive,
      ),
    write: (outcome) =>
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
      ),
  })

  for (const entry of entries) {
    if (unreadableMatcher && entry.matcher !== undefined) continue
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) {
        if (!ifEvaluatingEvent(event)) continue
        if (!matchesPermissionRule(hook.if, matchValue, ruleInput, cwd)) continue
      }
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDetach(
          superviseFork(runHookScript(hook, currentInput, cwd, event, false), ctx, hook.command),
        )
        continue
      }

      const exit = yield* Cell.run(hookVerdictCell, { hook, input: currentInput })
      if (Option.isSome(exit)) return exit.value
    }
  }

  const result: HooksForEventResult = {
    ...(currentInput === input ? {} : { updatedInput: currentInput }),
    ...(warning !== undefined ? { warning } : {}),
  }
  return result
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

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(
  function*(entries: readonly HookEntry[], ctx: HookSession, event: string) {
    const cwd = ctx.cwd
    const input: Record<string, unknown> = { ...sessionIds(() => ctx.sessionManager.getSessionId()) }
    const unreadableMatcher = matcherUnreadable(event)
    yield* Effect.forEach(
      Arr.filter(entries, (entry) => !(unreadableMatcher && entry.matcher !== undefined)),
      (entry) =>
        Effect.forEach(
          Arr.filter(entry.hooks, (hook): hook is CommandHook => hook.type === 'command' && hook.if === undefined),
          (hook) =>
            hook.async === true || hook.asyncRewake === true
              ? Effect.forkDetach(
                superviseFork(runHookScript(hook, input, cwd, event, false), ctx, hook.command),
              ).pipe(Effect.asVoid)
              : runHookScript(hook, input, cwd, event).pipe(Effect.asVoid),
          { discard: true },
        ),
      { discard: true },
    )
  },
)

export const runPreToolUseHooks = Effect.fn('runPreToolUseHooks')(function*(
  settings: HookSettings,
  event: HookToolCall,
  ctx: HookSession,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const rawInput = Option.getOrElse(asToolInput(event.input), () => EMPTY_TOOL_INPUT)
  const toolInput = normalizeToolInput(claudeToolName, rawInput)

  const shellCommand = extractShellCommand(event.toolName, rawInput)
  if (shellCommand !== undefined && shellCommand.length > 0) {
    const bashInput: Record<string, unknown> = {
      ...sessionData,
      tool_name: 'Bash',
      tool_input: { command: shellCommand },
      tool_call_id: event.toolCallId,
    }
    const bashResult = yield* runHooksForEvent(settings.hooks.PreToolUse, 'Bash', bashInput, ctx, 'PreToolUse')
    if (bashResult.block === true) {
      return bashResult.reason === undefined
        ? { block: true }
        : { block: true, reason: bashResult.reason }
    }
  }

  const targets = editTargetPaths(claudeToolName, toolInput)
  const payloads = targets.length === 0
    ? [toolInput]
    : targets.map((file_path) => ({ ...toolInput, file_path }))

  let lastResult: HooksForEventResult = {}
  for (const payload of payloads) {
    const input: Record<string, unknown> = {
      ...sessionData,
      tool_name: claudeToolName,
      tool_input: payload,
      tool_call_id: event.toolCallId,
    }

    const result = yield* runHooksForEvent(settings.hooks.PreToolUse, claudeToolName, input, ctx, 'PreToolUse')

    if (result.block === true) {
      return result.reason === undefined
        ? { block: true }
        : { block: true, reason: result.reason }
    }
    lastResult = result
  }

  const updated = payloads.length === 1 ? lastResult.updatedInput?.['tool_input'] : undefined

  Object.assign(event.input, denormalizeToolInput(rawInput, updated))

  return undefined
})

export const runPostToolUseHooks = Effect.fn('runPostToolUseHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const toolInput = normalizeToolInput(
    claudeToolName,
    Option.getOrElse(asToolInput(event.input), () => EMPTY_TOOL_INPUT),
  )
  const targets = editTargetPaths(claudeToolName, toolInput)
  const payloads = targets.length === 0
    ? [toolInput]
    : targets.map((file_path) => ({ ...toolInput, file_path }))

  let firstWarning: string | undefined
  let lastResult: FeedbackOnlyResult = {}
  for (const payload of payloads) {
    const input: Record<string, unknown> = {
      ...sessionData,
      tool_name: claudeToolName,
      tool_input: payload,
      tool_call_id: event.toolCallId,
      output: event.content,
      is_error: event.isError ?? false,
    }

    const result = yield* runHooksForEvent(settings.hooks.PostToolUse, claudeToolName, input, ctx, 'PostToolUse')
    if (result.block === true) return blockAsFeedback(result)
    if (firstWarning === undefined) firstWarning = result.warning
    lastResult = result
  }

  return firstWarning === undefined ? lastResult : { ...lastResult, warning: firstWarning }
})

const asTextBlocks = S.decodeUnknownOption(S.Array(S.Struct({ text: S.optional(S.String) })))
const asPlainText = S.decodeUnknownOption(S.String)

const errorText = (content: unknown): string =>
  Option.match(asTextBlocks(content), {
    onSome: (blocks) => blocks.flatMap((block) => block.text === undefined ? [] : [block.text]).join('\n'),
    onNone: () => Option.getOrElse(asPlainText(content), () => ''),
  })

export const runPostToolUseFailureHooks = Effect.fn('runPostToolUseFailureHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const toolInput = normalizeToolInput(
    claudeToolName,
    Option.getOrElse(asToolInput(event.input), () => EMPTY_TOOL_INPUT),
  )

  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    tool_name: claudeToolName,
    tool_input: toolInput,
    tool_use_id: event.toolCallId,
    error: errorText(event.content),
  }

  const result = yield* runHooksForEvent(
    settings.hooks.PostToolUseFailure,
    claudeToolName,
    input,
    ctx,
    'PostToolUseFailure',
  )
  const feedback: FeedbackOnlyResult = result.block === true ? blockAsFeedback(result) : result
  return feedback
})

export const runToolResultHooks = Effect.fn('runToolResultHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  const feedback: FeedbackOnlyResult = event.isError === true
    ? yield* runPostToolUseFailureHooks(settings, event, ctx)
    : yield* runPostToolUseHooks(settings, event, ctx)
  return feedback
})

export const runSessionStartHooks = Effect.fn('runSessionStartHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  const entries = settings.hooks.SessionStart
  if (entries.length === 0) return

  const cwd = ctx.cwd
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    reason,
  }

  for (const entry of entries) {
    if (entry.matcher !== undefined && !matchesMatcher(reason, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDetach(
          superviseFork(runHookScript(hook, input, cwd, 'SessionStart', false), ctx, hook.command),
        )
        continue
      }

      yield* runHookScript(hook, input, cwd, 'SessionStart')
    }
  }
})

export const runSessionSwitchHooks = Effect.fn('runSessionSwitchHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  if (reason !== 'resume' && reason !== 'fork') return
  yield* runSessionStartHooks(settings, reason, ctx)
})

export const runPreCompactHooks = Effect.fn('runPreCompactHooks')(function*(
  settings: HookSettings,
  ctx: HookSession,
) {
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }
  return yield* runHooksForEvent(settings.hooks.PreCompact, '', input, ctx, 'PreCompact')
})

export const runUserPromptSubmitHooks = Effect.fn('runUserPromptSubmitHooks')(function*(
  settings: HookSettings,
  event: HookPrompt,
  ctx: HookSession,
) {
  const entries = settings.hooks.UserPromptSubmit
  const cwd = ctx.cwd
  const hostBound = isHostBound(event.text)

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
  const submitCell = Cell.layer({
    read: ({ hook, input }: { readonly hook: CommandHook; readonly input: Record<string, unknown> }) =>
      runHookScript(hook, input, cwd, 'UserPromptSubmit'),
    decode: (raw: HookResult) =>
      Result.succeed(
        new InterpretHookCommand({
          result: raw,
          event: 'UserPromptSubmit',
          parsed: Exit.match(parseHookOutput(raw.stdout), {
            onFailure: () => Option.none(),
            onSuccess: Option.some,
          }),
        }),
      ),
    decide: interpretHookResult,
    encode: (outcome) =>
      Result.match(outcome, {
        onFailure: ({ code, stdout }) => ({ blockReason: undefined, code, stdout }),
        onSuccess: (decision) => ({
          blockReason: Match.value(decision).pipe(
            Match.tag('Block', (b) => b.reason),
            Match.tag('Allow', () => undefined),
            Match.tag('Warning', () => undefined),
            Match.exhaustive,
          ),
          code: decision.code,
          stdout: decision.stdout,
        }),
      }),
    write: ({ blockReason, code, stdout }) =>
      Effect.sync(() => {
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
      }),
  })

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      const exit = yield* Cell.run(submitCell, { hook, input })
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

  return Match.value(hostBound).pipe(
    Match.when(true, () => undefined),
    Match.when(false, deliver),
    Match.exhaustive,
  )
})

export type HookDispatchResult =
  | ToolCallEventResult
  | ToolResultEventResult
  | InputEventResult
  | { readonly cancel: boolean }
  | undefined

export type HookDispatchContext = FileSystem | ChildProcessSpawner | Scope.Scope | ClaudeSettings

const settingsFor = (ctx: HookSession) => Effect.flatMap(ClaudeSettings, (port) => port.load(ctx.cwd, ctx.homeDir))

const dispatchAdmit = <Response>(
  write: (settings: HookSettings) => Effect.Effect<Response, PlatformError, HookDispatchContext>,
  empty: Response,
  ctx: HookSession,
) =>
  Effect.flatMap(
    settingsFor(ctx),
    (settings) =>
      Match.value(admitLoadedSettings(admitPresent(Option.isSome(Option.fromNullishOr(settings))))).pipe(
        Match.tag('SkipHooks', () => Effect.succeed(empty)),
        Match.tag('RunHooks', () => {
          const loaded = Option.fromNullishOr(settings)
          return write(Option.getOrThrow(loaded))
        }),
        Match.exhaustive,
      ),
  )

export const onToolCall = (event: HookToolCall, ctx: HookSession) =>
  dispatchAdmit((settings) => runPreToolUseHooks(settings, event, ctx), undefined, ctx)

export const onToolResult: (
  event: ToolResultEvent,
  ctx: HookSession,
) => Effect.Effect<ToolResultEventResult | undefined, PlatformError, HookDispatchContext> = (event, ctx) =>
  dispatchAdmit(
    (settings) =>
      Effect.gen(function*() {
        const result = yield* runToolResultHooks(settings, event, ctx)
        if (result.warning === undefined) return undefined
        return {
          content: [...event.content, { type: 'text' as const, text: result.warning }],
          isError: event.isError,
        } satisfies ToolResultEventResult
      }),
    undefined,
    ctx,
  )

export const onPrompt = (event: HookPrompt, ctx: HookSession) =>
  dispatchAdmit((settings) => runUserPromptSubmitHooks(settings, event, ctx), undefined, ctx)

export const onSessionStart = (reason: string, ctx: HookSession) =>
  Effect.gen(function*() {
    const gaps = yield* (yield* ClaudeSettings).gaps(ctx.cwd, ctx.homeDir)
    const coverageLines = [
      ...gaps.coverage.unrecognized.map((row) => `  ${row.event}: ${row.reason}`),
      ...gaps.coverage.notCarried.map((row) => `  ${row.event}: not carried by this bridge — ${row.reason}`),
      ...gaps.coverage.matcherNotEvaluable.map(
        (row) => `  ${row.event}: hook skipped, matcher not evaluable — ${row.reason}`,
      ),
      ...gaps.coverage.matcherOutOfReach.map((row) => `  ${row.event}: ${row.reason}`),
      ...gaps.coverage.shadowed.map((row) => `  ${row.event}: ${row.reason}`),
      ...gaps.coverage.disabled.map((row) => `  ${row.event}: ${row.reason}`),
    ]
    if (coverageLines.length > 0) {
      ctx.ui.notify(
        `Hook coverage — configured hooks this bridge will not run:\n${coverageLines.join('\n')}`,
        'warning',
      )
    }
    if (gaps.unsupportedHookTypes.length > 0) {
      ctx.ui.notify(
        `Skipping hook(s) this bridge cannot run yet: type ${gaps.unsupportedHookTypes.join(', ')}`,
        'warning',
      )
    }
    if (gaps.malformedFiles.length > 0) {
      ctx.ui.notify(
        `Hooks are NOT running from malformed settings file(s): ${gaps.malformedFiles.join(', ')}`,
        'error',
      )
    }
    return yield* dispatchAdmit((settings) => runSessionStartHooks(settings, reason, ctx), undefined, ctx)
  })

export const onSessionCompact = (ctx: HookSession) =>
  dispatchAdmit(
    (settings) =>
      Effect.gen(function*() {
        yield* runSessionStartHooks(settings, 'compact', ctx)
        yield* runLifecycleHooks(settings.hooks.PostCompact, ctx, 'PostCompact')
      }),
    undefined,
    ctx,
  )

export const onPreCompact = (ctx: HookSession) =>
  dispatchAdmit(
    (settings) =>
      Effect.gen(function*() {
        const result = yield* runPreCompactHooks(settings, ctx)
        if (result.block !== true) return undefined
        ctx.ui.notify(
          `Compaction cancelled by a PreCompact hook: ${result.reason ?? 'no reason given'}`,
          'warning',
        )
        return { cancel: true as const }
      }),
    undefined,
    ctx,
  )

export const onSessionSwitch = (reason: string, ctx: HookSession) =>
  dispatchAdmit((settings) => runSessionSwitchHooks(settings, reason, ctx), undefined, ctx)

export const onSessionShutdown = (ctx: HookSession) =>
  dispatchAdmit((settings) => runLifecycleHooks(settings.hooks.SessionEnd, ctx, 'SessionEnd'), undefined, ctx)

export const onSessionStop = (ctx: HookSession) =>
  dispatchAdmit((settings) => runLifecycleHooks(settings.hooks.Stop, ctx, 'Stop'), undefined, ctx)

const HANDLER_CEILING_MS = 28_000

export const HookDispatcherTask = (
  pi: ExtensionAPI,
  runSafe: <A, E>(effect: Effect.Effect<A, E, HookDispatchContext>) => Promise<A>,
): void => {
  const bounded = async <A, E>(effect: Effect.Effect<A, E, HookDispatchContext>): Promise<A | undefined> => {
    const timed = Effect.gen(function*() {
      const outcome = yield* Effect.result(effect)
      if (Result.isFailure(outcome)) throw outcome.failure
      return outcome.success
    }).pipe(Effect.timeoutOption(HANDLER_CEILING_MS))
    return Option.getOrUndefined(await runSafe(timed))
  }

  const session = (
    ctx: {
      readonly cwd: string
      readonly sessionManager: HookSession['sessionManager']
      readonly ui: HookSession['ui']
    },
  ): HookSession => ({
    cwd: ctx.cwd,
    homeDir: homedir(),
    sessionManager: ctx.sessionManager,
    ui: ctx.ui,
  })

  pi.on('tool_call', (event: ToolCallEvent, ctx) => bounded(onToolCall(event, session(ctx))))
  pi.on('tool_result', (event: ToolResultEvent, ctx) => bounded(onToolResult(event, session(ctx))))
  pi.on('input', (event: InputEvent, ctx) => bounded(onPrompt(event, session(ctx))))
  pi.on('session_start', (_event, ctx) => bounded(onSessionStart('startup', session(ctx))))
  pi.on('session_compact', (_event, ctx) => bounded(onSessionCompact(session(ctx))))
  pi.on('session_before_compact', (_event, ctx) => bounded(onPreCompact(session(ctx))))
  pi.on('session_switch', (event, ctx) => bounded(onSessionSwitch(event.reason, session(ctx))))
  pi.on('session_shutdown', (_event, ctx) => bounded(onSessionShutdown(session(ctx))))
  pi.on('session_stop', (_event, ctx) => bounded(onSessionStop(session(ctx))))
}
