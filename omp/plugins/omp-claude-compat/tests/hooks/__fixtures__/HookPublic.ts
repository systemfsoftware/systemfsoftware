export type { HookDispatchResult } from '../../../src/hooks/mod.js'
export { detachIn, onSessionStart, onToolCall, onToolResult } from '../../../src/hooks/mod.js'
export type { HookSession, HookToolCall } from '../../../src/hooks/mod.js'
import { Effect, Layer, Scope } from 'effect'
import { ClaudeSettingsLive } from '../../../src/settings/mod.js'

export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)
