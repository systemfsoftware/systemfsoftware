import type {
  ExtensionAPI,
  InputEvent,
  InputEventResult,
  ToolCallEvent,
  ToolCallEventResult,
  ToolResultEvent,
  ToolResultEventResult,
} from '@oh-my-pi/pi-coding-agent'
import { ClaudeSettings, ifEvaluatingEvent, matcherUnreadable } from '@systemfsoftware/claude-settings'
import type { CommandHook, HookEntry, HookSettings } from '@systemfsoftware/claude-settings'
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
  pipe,
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
import {
  type AdmitCommand,
  type AdmitError,
  admitLoadedSettings,
  admitPresent,
  type HookDispatchDecision,
  skipHooks,
} from './admit.workflow.js'
import { Blocked, Continue, type HookOutcome, HookOutputFromStdout, HookResult } from './hooks.schema.js'
import type { HookPrompt, HookSession, HookToolCall, HookToolResult } from './hooks.schema.js'
import {
  type HookDecision,
  InterpretHookCommand,
  type SubmitHookVerdictError,
  submitVerdict,
  SubmitVerdictCommand,
  Warning,
} from './hooks.workflow.js'
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

/** The stdout crossing applied where the boundary is crossed. */
const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)

/**
 * Claude Code hands `UserPromptSubmit` stdout to the model in a separate
 * `additionalContext` field. OMP's `InputEventResult` has none, so this bridge
 * fakes it by prefixing the prompt text — and the host parses slash, bash,
 * python and yield-queue prompts off their opening characters before a model
 * is involved. A prefix demotes a command to prose: `/compact` plus a hook
 * note becomes `note\n\n/compact`, which no longer opens with `/`.
 *
 * Over-classifying is safe, under-classifying is not: a prompt wrongly called
 * host-bound takes its context one turn late, while one wrongly called
 * model-bound loses the command outright. Widen the list on doubt.
 */
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

/**
 * Shared-state quarantine: an async hook outlives the dispatch that started
 * it, so its context has nowhere to return to. Claude Code delivers that
 * context on the following conversation turn; with nowhere to hold it the
 * context is simply lost, which is the whole point of running the hook.
 * Bounded so a runaway or looping hook cannot grow it without limit.
 */
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

// ── Deadline ──
/**
 * Run `self` detached in `scope`, giving up on the result after `deadline`
 * without giving up on the work.
 *
 * `Effect.timeout` interrupts what it wraps, so timing out the work itself
 * cancels it. Here the deadline wraps only the join, and the fibre belongs to
 * `scope` rather than the caller - observing a fibre does not own it. The
 * caller stops waiting; the work runs on until `scope` closes, which is the
 * one thing that interrupts it and runs its finalisers.
 */
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

/** The fallback the deadline laws below hand to `onDeadline`. */
const onGaveUp: LazyArg<string> = () => 'gave-up'

if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('@effect/vitest')
  const { Effect, Exit, Fiber, Ref, Scope } = await import('effect')
  const { FastCheck: fc, TestClock } = await import('effect/testing')

  /**
   * Each case forks a fibre and drives the clock, so these cost far more than a
   * pure predicate: the default 100 runs overruns vitest's timeout once the
   * suite is running files in parallel.
   */
  const budget = { fastCheck: { numRuns: 25 }, timeout: 30_000 }

  const deadlineMs = fc.integer({ min: 1, max: 10_000 })

  const overrunMs = fc.integer({ min: 1, max: 10_000 })

  const deadlineWithUnderrun = deadlineMs.chain((deadline) =>
    fc.tuple(fc.constant(deadline), fc.integer({ min: 0, max: deadline - 1 }))
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

  describe('detachIn', () => {
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
  })
}

// ── HookPayload ──

export const EMPTY_TOOL_INPUT: Record<string, unknown> = {}

export const asToolInput = S.decodeUnknownOption(ToolInputRecord)

// ── HookFeedback ──
export interface HooksForEventResult {
  readonly block?: boolean
  readonly reason?: string
  readonly warning?: string
  readonly updatedInput?: Record<string, unknown>
}

export type FeedbackOnlyResult = Omit<HooksForEventResult, 'block' | 'reason'>

export const blockAsFeedback = (result: HooksForEventResult): FeedbackOnlyResult =>
  result.reason === undefined ? {} : { warning: result.reason }

// ── RunHookScript ──
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
    stdin: Stream.fromIterable([new TextEncoder().encode(stdinText)]),
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  }
  const hookCommand = hook.args === undefined
    ? ChildProcess.make(shell, [evalFlag, expand(hook.command)], options)
    : ChildProcess.make(expand(hook.command), hook.args.map(expand), options)

  // Detached whole: the stdout/stderr drain travels with the child, so
  // abandoning the wait never leaves it writing into a pipe nobody reads.
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
    // Past the deadline no joiner is left to surface a failure.
    Effect.tapCause((cause) => Effect.logWarning(`hook ${hook.command} failed`, cause)),
  )

  return yield* detachIn(run, hookScope, {
    deadline: timeoutMs,
    onDeadline: () => ({ code: -1, stdout: '', stderr: `timeout after ${timeoutMs}ms${capNote}` }),
  })
})

// ── SuperviseFork ──
/**
 * Nothing awaits a forked hook, so an unhandled failure here reaches no one:
 * a mistyped exec-form command would fail to spawn in total silence.
 */
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

// ── RunHooksForEvent ──
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
  readonly readContext: ChildProcessSpawner | Scope.Scope
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

// ── RunLifecycleHooks ──
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

// ── RunPreToolUseHooks ──
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

  // One OMP `edit` can name many files; Claude Code's `Edit` names exactly one.
  // Dispatch the chain once per target so a guard sees every path: populating
  // only the first lets an innocent leading section screen a forbidden one.
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

  // Only a single-target call has an unambiguous rewrite target, and the delta
  // must go back under the key names OMP reads — the forward pass renamed them.
  const updated = payloads.length === 1 ? lastResult.updatedInput?.['tool_input'] : undefined
  // Merged in place: OMP reads the rewrite back off the very object it passed.
  Object.assign(event.input, denormalizeToolInput(rawInput, updated))

  return undefined
})

// ── RunPostToolUseHooks ──
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

// ── RunPostToolUseFailureHooks ──
const asTextBlocks = S.decodeUnknownOption(S.Array(S.Struct({ text: S.optional(S.String) })))
const asPlainText = S.decodeUnknownOption(S.String)

/** Claude Code documents `error` as a string; OMP carries content blocks. */
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
  // No per-target fan-out: a tool that failed edited nothing.
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

// ── RunToolResultHooks ──
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

// ── RunSessionStartHooks ──
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

// ── RunSessionSwitchHooks ──
export const runSessionSwitchHooks = Effect.fn('runSessionSwitchHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  if (reason !== 'resume' && reason !== 'fork') return
  yield* runSessionStartHooks(settings, reason, ctx)
})

// ── RunPreCompactHooks ──
/**
 * The matcher this event documents is `trigger` (manual vs auto), which OMP's
 * payload does not carry — U4's gate skips any hook that declares one, so only
 * unscoped hooks reach here and `matchValue` is never consulted.
 */
export const runPreCompactHooks = Effect.fn('runPreCompactHooks')(function*(
  settings: HookSettings,
  ctx: HookSession,
) {
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }
  return yield* runHooksForEvent(settings.hooks.PreCompact, '', input, ctx, 'PreCompact')
})

// ── RunUserPromptSubmitHooks ──
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

// ── HookDispatcherExecutor ──
export type HookDispatchResult =
  | ToolCallEventResult
  | ToolResultEventResult
  | InputEventResult
  | { readonly cancel: boolean }
  | undefined

export type HookDispatchContext = FileSystem | ChildProcessSpawner | Scope.Scope | ClaudeSettings

const settingsFor = (ctx: HookSession) => Effect.flatMap(ClaudeSettings, (port) => port.load(ctx.cwd, ctx.homeDir))

interface SettingsAdmitPhases<Response> extends Cell.Phases {
  readonly command: HookSession
  readonly raw: HookSettings | null
  readonly decoded: AdmitCommand
  readonly decision: HookDispatchDecision
  readonly decisionError: AdmitError
  readonly output: HookDispatchDecision
  readonly response: Response
  readonly decodeError: never
  readonly readError: never
  readonly writeError: PlatformError
  readonly readContext: HookDispatchContext
  readonly writeContext: HookDispatchContext
}

const admitSettings = <Response>(
  write: (settings: HookSettings) => Effect.Effect<Response, PlatformError, HookDispatchContext>,
  empty: Response,
) => {
  let loaded: Option.Option<HookSettings> = Option.none()
  return pipe(
    Cell.read<SettingsAdmitPhases<Response>>((ctx) => settingsFor(ctx)),
    Cell.decode<SettingsAdmitPhases<Response>>((settings) => {
      loaded = Option.fromNullishOr(settings)
      return Result.succeed(admitPresent(Option.isSome(loaded)))
    }),
    Cell.decide<SettingsAdmitPhases<Response>>(admitLoadedSettings),
    Cell.encode<SettingsAdmitPhases<Response>>((outcome) => Result.getOrElse(outcome, skipHooks)),
    Cell.write<SettingsAdmitPhases<Response>>((decision) =>
      Match.value(decision).pipe(
        Match.tag('SkipHooks', () => Effect.succeed(empty)),
        Match.tag('RunHooks', () => write(Option.getOrThrow(loaded))),
        Match.exhaustive,
      )
    ),
  )
}

export const onToolCall = (event: HookToolCall, ctx: HookSession) =>
  Cell.apply(admitSettings((settings) => runPreToolUseHooks(settings, event, ctx), undefined), ctx)

export const onToolResult = (event: ToolResultEvent, ctx: HookSession) =>
  Cell.apply(
    admitSettings(
      (settings) =>
        Effect.gen(function*() {
          const result = yield* runToolResultHooks(settings, event, ctx)
          if (result.warning === undefined) return undefined
          return {
            content: [...event.content, { type: 'text' as const, text: result.warning }],
            isError: event.isError,
          }
        }),
      undefined,
    ),
    ctx,
  )

export const onPrompt = (event: HookPrompt, ctx: HookSession) =>
  Cell.apply(admitSettings((settings) => runUserPromptSubmitHooks(settings, event, ctx), undefined), ctx)

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
    return yield* Cell.apply(
      admitSettings((settings) => runSessionStartHooks(settings, reason, ctx), undefined),
      ctx,
    )
  })

export const onSessionCompact = (ctx: HookSession) =>
  Cell.apply(
    admitSettings(
      (settings) =>
        Effect.gen(function*() {
          yield* runSessionStartHooks(settings, 'compact', ctx)
          yield* runLifecycleHooks(settings.hooks.PostCompact, ctx, 'PostCompact')
        }),
      undefined,
    ),
    ctx,
  )

export const onPreCompact = (ctx: HookSession) =>
  Cell.apply(
    admitSettings(
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
    ),
    ctx,
  )

export const onSessionSwitch = (reason: string, ctx: HookSession) =>
  Cell.apply(admitSettings((settings) => runSessionSwitchHooks(settings, reason, ctx), undefined), ctx)

export const onSessionShutdown = (ctx: HookSession) =>
  Cell.apply(
    admitSettings((settings) => runLifecycleHooks(settings.hooks.SessionEnd, ctx, 'SessionEnd'), undefined),
    ctx,
  )

export const onSessionStop = (ctx: HookSession) =>
  Cell.apply(
    admitSettings((settings) => runLifecycleHooks(settings.hooks.Stop, ctx, 'Stop'), undefined),
    ctx,
  )

// ── HookDispatcherHandler ──
const HANDLER_CEILING_MS = 28_000

export const HookDispatcherTask = (
  pi: ExtensionAPI,
  runSafe: <A, E>(effect: Effect.Effect<A, E, HookDispatchContext>) => Promise<A>,
): void => {
  /**
   * The ceiling and the failure re-raise are the same for every event, so they
   * are applied to the handler's own effect. Each `pi.on` registration already
   * names which handler runs, so its result type is the handler's, not a union.
   */
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
