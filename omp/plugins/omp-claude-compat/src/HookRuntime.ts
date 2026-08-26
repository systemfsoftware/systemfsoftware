import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { ProjectConfigLive } from '@systemfsoftware/omp-platform'
import { Effect, Layer, ManagedRuntime, Scope } from 'effect'
import { CollectSettingsGapsExecutorDeps } from './internal/CollectSettingsGapsExecutor.js'
import { LoadSettingsExecutorDeps } from './internal/LoadSettingsExecutor.js'
import { RunHookScriptExecutorDeps } from './internal/RunHookScriptExecutor.js'
import { RunHooksForEventExecutorDeps } from './internal/RunHooksForEventExecutor.js'
import { RunLifecycleHooksExecutorDeps } from './internal/RunLifecycleHooksExecutor.js'
import { RunPostToolUseFailureHooksExecutorDeps } from './internal/RunPostToolUseFailureHooksExecutor.js'
import { RunPostToolUseHooksExecutorDeps } from './internal/RunPostToolUseHooksExecutor.js'
import { RunPreCompactHooksExecutorDeps } from './internal/RunPreCompactHooksExecutor.js'
import { RunPreToolUseHooksExecutorDeps } from './internal/RunPreToolUseHooksExecutor.js'
import { RunSessionStartHooksExecutorDeps } from './internal/RunSessionStartHooksExecutor.js'
import { RunSessionSwitchHooksExecutorDeps } from './internal/RunSessionSwitchHooksExecutor.js'
import { RunToolResultHooksExecutorDeps } from './internal/RunToolResultHooksExecutor.js'
import { RunUserPromptSubmitHooksExecutorDeps } from './internal/RunUserPromptSubmitHooksExecutor.js'
import { SuperviseForkExecutorDeps } from './internal/SuperviseForkExecutor.js'

/** Released when the runtime is disposed, which OMP triggers on SIGINT/SIGTERM. */
export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  Layer.effect(LoadSettingsExecutorDeps, Effect.scope),
  Layer.effect(CollectSettingsGapsExecutorDeps, Effect.scope),
  Layer.effect(RunHookScriptExecutorDeps, Effect.scope),
  Layer.effect(RunHooksForEventExecutorDeps, Effect.scope),
  Layer.effect(RunPreToolUseHooksExecutorDeps, Effect.scope),
  Layer.effect(RunPostToolUseHooksExecutorDeps, Effect.scope),
  Layer.effect(RunPostToolUseFailureHooksExecutorDeps, Effect.scope),
  Layer.effect(RunToolResultHooksExecutorDeps, Effect.scope),
  Layer.effect(RunPreCompactHooksExecutorDeps, Effect.scope),
  Layer.effect(RunUserPromptSubmitHooksExecutorDeps, Effect.scope),
  Layer.effect(RunSessionStartHooksExecutorDeps, Effect.scope),
  Layer.effect(RunSessionSwitchHooksExecutorDeps, Effect.scope),
  Layer.effect(RunLifecycleHooksExecutorDeps, Effect.scope),
  Layer.effect(SuperviseForkExecutorDeps, Effect.scope),
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
