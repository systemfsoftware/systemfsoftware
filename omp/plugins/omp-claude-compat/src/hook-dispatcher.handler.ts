import { CommandExecutor } from '@effect/platform/CommandExecutor'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@oh-my-pi/pi-coding-agent'
import { createTelemetry } from '@systemfsoftware/omp-utils'
import { Cause, Effect, Exit, Layer } from 'effect'
import {
  HookDispatcherExecutorDeps,
  loadSettings,
  runLifecycleHooks,
  runPostToolUseHooks,
  runPreToolUseHooks,
  runSessionStartHooks,
  runUserPromptSubmitHooks,
} from './hook-dispatcher.executor.js'
import { runtime } from './runtime.js'

export const HookDispatcherTask = (pi: ExtensionAPI): Layer.Layer<never> =>
  Layer.effectDiscard(
    Effect.sync(() => {
      const tel = createTelemetry('claude_compat', pi.logger)
      const telLayer = Layer.succeed(HookDispatcherExecutorDeps, { tel })

      const runSafe = async <A, E>(
        effect: Effect.Effect<A, E, CommandExecutor | FileSystem | HookDispatcherExecutorDeps | PathModule.Path>,
      ) => {
        const exit = await runtime.runPromise(
          effect.pipe(Effect.provide(telLayer), Effect.exit),
        )
        if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
        return exit.value
      }

      pi.on('tool_call', (event: ToolCallEvent, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          return yield* runPreToolUseHooks(settings, event, ctx)
        })))

      pi.on('tool_result', (event: ToolResultEvent, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
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
        })))

      pi.on('input', (event: InputEvent, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          return yield* runUserPromptSubmitHooks(settings, event, ctx)
        })))

      pi.on('session_start', (_event: { type: string }, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          yield* runSessionStartHooks(settings, 'start', ctx)
          return undefined
        })))

      pi.on('session_compact', (_event: { type: string }, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          yield* runSessionStartHooks(settings, 'compact', ctx)
          return undefined
        })))

      pi.on('agent_start', (_event: { type: string }, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          yield* runSessionStartHooks(settings, 'resume', ctx)
          return undefined
        })))

      pi.on('session_shutdown', (_event: { type: string }, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          if (settings.disableAllHooks) return undefined
          yield* runLifecycleHooks(settings.hooks.SessionEnd, ctx)
          return undefined
        })))

      pi.on('session_stop', (_event: { type: string }, ctx: ExtensionContext) =>
        runSafe(Effect.gen(function*() {
          const settings = yield* loadSettings(ctx.cwd)
          if (!settings) return undefined
          if (settings.disableAllHooks) return undefined
          yield* runLifecycleHooks(settings.hooks.Stop, ctx)
          return undefined
        })))
    }),
  )
