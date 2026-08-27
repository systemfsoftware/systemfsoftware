import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { ClaudeSettingsLive } from '@systemfsoftware/claude-settings'
import { HarnessPolicyLive } from '@systemfsoftware/effect-harness-policy'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Effect, Layer, Scope } from 'effect'
export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)

const nodeLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(NodePath.layer),
)

const appLayer = HookScopeLive.pipe(
  Layer.provideMerge(HarnessPolicyLive),
  Layer.provideMerge(nodeLayer),
)

export type HookRuntimeContext = Layer.Success<typeof appLayer>

export const { runtime, runSafe } = bootstrapPluginRuntime(appLayer)

export default runtime
