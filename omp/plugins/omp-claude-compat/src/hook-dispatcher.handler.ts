import type { CommandExecutor } from '@effect/platform/CommandExecutor'
import type { FileSystem } from '@effect/platform/FileSystem'
import type * as PathModule from '@effect/platform/Path'
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@oh-my-pi/pi-coding-agent'
import type { Effect } from 'effect'

export const HookDispatcherTask = (pi: ExtensionAPI): void => {
  const runSafe = async <A, E>(
    effect: Effect.Effect<A, E, CommandExecutor | FileSystem | PathModule.Path>,
  ): Promise<A> => {
    const [runtime, effectMod] = await Promise.all([
      import('./runtime.js').then(mod => mod.default),
      import('effect'),
    ])
    const { Cause, Effect: EffectInner, Exit } = effectMod
    const exited = effect.pipe(EffectInner.exit)
    const exit = await runtime.runPromise(exited)
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    return exit.value
  }

  pi.on('tool_call', async (event: ToolCallEvent, ctx: ExtensionContext) => {
    const { loadSettings, runPreToolUseHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        return yield* runPreToolUseHooks(settings, event, ctx)
      }),
    )
  })

  pi.on('tool_result', async (event: ToolResultEvent, ctx: ExtensionContext) => {
    const { loadSettings, runToolResultHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        const result = yield* runToolResultHooks(settings, event, ctx)
        if (result.block === true) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: result.reason ?? 'Blocked by PostToolUse hook' }],
          }
        }
        if (result.warning !== undefined) {
          return {
            content: [...event.content, { type: 'text' as const, text: result.warning }],
            isError: event.isError,
          }
        }
        return undefined
      }),
    )
  })

  pi.on('input', async (event: InputEvent, ctx: ExtensionContext) => {
    const { loadSettings, runUserPromptSubmitHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        return yield* runUserPromptSubmitHooks(settings, event, ctx)
      }),
    )
  })

  pi.on('session_start', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { collectSettingsGaps, coverageReportLines, loadSettings, runSessionStartHooks } = await import(
      './hook-dispatcher.executor.js'
    )
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const gaps = yield* collectSettingsGaps(ctx.cwd)
        const coverageLines = coverageReportLines(gaps.coverage)
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
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'startup', ctx)
        return undefined
      }),
    )
  })

  pi.on('session_compact', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { loadSettings, runLifecycleHooks, runSessionStartHooks } = await import(
      './hook-dispatcher.executor.js'
    )
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'compact', ctx)
        yield* runLifecycleHooks(settings.hooks.PostCompact, ctx, 'PostCompact')
        return undefined
      }),
    )
  })

  pi.on('session_before_compact', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { loadSettings, runPreCompactHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        const result = yield* runPreCompactHooks(settings, ctx)
        if (result.block !== true) return undefined
        // Cancelling a compaction the context limit triggered leaves the session
        // over its limit and fails the request. Claude Code has the same hazard;
        // say which hook did it rather than letting it fail unexplained.
        ctx.ui.notify(
          `Compaction cancelled by a PreCompact hook: ${result.reason ?? 'no reason given'}`,
          'warning',
        )
        return { cancel: true }
      }),
    )
  })

  pi.on('session_switch', async (event: { type: string; reason: string }, ctx: ExtensionContext) => {
    const { loadSettings, runSessionSwitchHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionSwitchHooks(settings, event.reason, ctx)
        return undefined
      }),
    )
  })

  pi.on('session_shutdown', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { loadSettings, runLifecycleHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runLifecycleHooks(settings.hooks.SessionEnd, ctx, 'SessionEnd')
        return undefined
      }),
    )
  })

  pi.on('session_stop', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { loadSettings, runLifecycleHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runLifecycleHooks(settings.hooks.Stop, ctx, 'Stop')
        return undefined
      }),
    )
  })
}
