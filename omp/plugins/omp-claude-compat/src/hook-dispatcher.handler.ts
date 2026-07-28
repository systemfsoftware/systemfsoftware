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
    const { loadSettings, runPostToolUseHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        const result = yield* runPostToolUseHooks(settings, event, ctx)
        if (result?.block) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: result.reason ?? 'Blocked by PostToolUse hook' }],
          }
        }
        if (result?.warning) {
          return {
            content: [...(event.content ?? []), { type: 'text' as const, text: result.warning }],
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
    const { collectSettingsGaps, loadSettings, runSessionStartHooks } = await import(
      './hook-dispatcher.executor.js'
    )
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const gaps = yield* collectSettingsGaps(ctx.cwd)
        if (gaps.unknownEvents.length > 0) {
          ctx.ui.notify(
            `Ignoring unsupported hook event(s) in settings.json: ${gaps.unknownEvents.join(', ')}`,
            'warning',
          )
        }
        if (gaps.unsupportedHookTypes.length > 0) {
          ctx.ui.notify(
            `Skipping hook(s) this bridge cannot run yet: type ${gaps.unsupportedHookTypes.join(', ')}`,
            'warning',
          )
        }
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'start', ctx)
        return undefined
      }),
    )
  })

  pi.on('session_compact', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { loadSettings, runSessionStartHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'compact', ctx)
        return undefined
      }),
    )
  })

  pi.on('agent_start', async (_event: { type: string }, ctx: ExtensionContext) => {
    const { loadSettings, runSessionStartHooks } = await import('./hook-dispatcher.executor.js')
    const { Effect } = await import('effect')
    return runSafe(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'resume', ctx)
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
        if (settings.disableAllHooks) return undefined
        yield* runLifecycleHooks(settings.hooks.SessionEnd, ctx)
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
        if (settings.disableAllHooks) return undefined
        yield* runLifecycleHooks(settings.hooks.Stop, ctx)
        return undefined
      }),
    )
  })
}
