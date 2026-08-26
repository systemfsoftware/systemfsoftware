import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { ProjectConfigLive } from '@systemfsoftware/omp-platform'
import { Effect, Layer, ManagedRuntime, Scope } from 'effect'
import { ClaudeSettingsLive } from './ClaudeSettings.js'

/** Released when the runtime is disposed, which OMP triggers on SIGINT/SIGTERM. */
export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)

const nodeLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(NodePath.layer),
)

const appLayer = HookScopeLive.pipe(
  Layer.provideMerge(ProjectConfigLive),
  Layer.provideMerge(nodeLayer),
)

export type HookRuntimeContext = Layer.Success<typeof appLayer>

const runtime = ManagedRuntime.make(appLayer)

/**
 * Disposal is terminal and this chunk is cached once per process while the
 * host re-imports the extension entry per session, so the handlers belong
 * here: registering them per session load would leak a listener per subagent.
 */
const disposeOnSignal = () => {
  void runtime.dispose()
}
process.once('SIGINT', disposeOnSignal)
process.once('SIGTERM', disposeOnSignal)

export default runtime
