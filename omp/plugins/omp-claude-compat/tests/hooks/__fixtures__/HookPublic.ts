export type { HookDispatchResult } from '../../../src/hooks/mod.js'
export { onSessionStart, onToolCall, onToolResult } from '../../../src/hooks/mod.js'
export type { HookSession, HookToolCall } from '../../../src/hooks/mod.js'
import { ClaudeSettingsLive } from '../../../src/settings/mod.js'
import { Effect, Layer, Scope } from 'effect'

export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)
