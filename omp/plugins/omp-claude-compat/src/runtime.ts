import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { ClaudeSettingsLive } from './settings/mod.js'
import { HarnessPolicyLive } from '@systemfsoftware/effect-harness-policy'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Effect, Layer, Scope } from 'effect'
import { FileReferencedContentLive } from './inject/file-referenced-content.js'
export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)
const nodeLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(NodePath.layer),
)

const deps = Layer.mergeAll(
  HarnessPolicyLive.pipe(Layer.provide(nodeLayer)),
  nodeLayer,
)
const referencedLive = FileReferencedContentLive.pipe(Layer.provide(deps))

const appLayer = HookScopeLive.pipe(
  Layer.provideMerge(deps),
  Layer.provideMerge(referencedLive),
)

export type HookRuntimeContext = Layer.Success<typeof appLayer>

export const { runtime, runSafe } = bootstrapPluginRuntime(appLayer)

export default runtime
