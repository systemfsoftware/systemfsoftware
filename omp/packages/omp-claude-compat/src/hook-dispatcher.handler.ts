/**
 * OMP Hook Dispatcher — thin entry point.
 *
 * Registers event handlers with the OMP ExtensionAPI. The OMP host is a
 * promise-native framework calling per-event callbacks; we interpret each
 * callback through a single ManagedRuntime built from the Node layer.
 * Pure decisions live in hook-dispatcher.workflow.ts;
 * I/O orchestration in hook-dispatcher.executor.ts.
 */
import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@oh-my-pi/pi-coding-agent'
import { createTelemetry } from '@systemfsoftware/omp-utils'
import { Effect, Layer, ManagedRuntime } from 'effect'
import {
  loadSettings,
  runLifecycleHooks,
  runPostToolUseHooks,
  runPreToolUseHooks,
  runSessionStartHooks,
  runUserPromptSubmitHooks,
  setTelemetryEmitter,
} from './hook-dispatcher.executor.js'
const nodeLayer = NodeCommandExecutor.layer.pipe(Layer.provideMerge(NodeFileSystem.layer))
const runtime = ManagedRuntime.make(nodeLayer)

export default function hookDispatcherExtension(pi: ExtensionAPI): void {
  setTelemetryEmitter(createTelemetry('claude_compat', pi.logger))

  pi.on('tool_call', (event: ToolCallEvent, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        return yield* runPreToolUseHooks(settings, event, ctx)
      }),
    ))

  pi.on('tool_result', (event: ToolResultEvent, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        const result = yield* runPostToolUseHooks(settings, event, ctx)
        if (result?.block) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: result.reason ?? `Blocked by PostToolUse hook` }],
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
    ))

  pi.on('input', (event: InputEvent, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        return yield* runUserPromptSubmitHooks(settings, event, ctx)
      }),
    ))

  pi.on('session_start', (_event: { type: string }, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'start', ctx)
        return undefined
      }),
    ))

  pi.on('session_compact', (_event: { type: string }, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'compact', ctx)
        return undefined
      }),
    ))

  pi.on('agent_start', (_event: { type: string }, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runSessionStartHooks(settings, 'resume', ctx)
        return undefined
      }),
    ))

  pi.on('session_shutdown', (_event: { type: string }, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runLifecycleHooks(settings.hooks.SessionEnd, ctx)
        return undefined
      }),
    ))

  pi.on('session_stop', (_event: { type: string }, ctx: ExtensionContext) =>
    runtime.runPromise(
      Effect.gen(function*() {
        const settings = yield* loadSettings(ctx.cwd)
        if (!settings) return undefined
        yield* runLifecycleHooks(settings.hooks.Stop, ctx)
        return undefined
      }),
    ))
}
