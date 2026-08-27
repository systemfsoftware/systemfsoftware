export type { HookDispatchResult } from '@systemfsoftware/claude-hooks'
export { onSessionStart, onToolCall, onToolResult } from '@systemfsoftware/claude-hooks'
export type { HookSession, HookToolCall } from '@systemfsoftware/claude-hooks'
import { ClaudeSettingsLive } from '@systemfsoftware/claude-settings'
import { Effect, Layer, Scope } from 'effect'

export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)
