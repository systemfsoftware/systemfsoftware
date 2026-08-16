import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Effect, Layer, ManagedRuntime, Scope } from 'effect'
import { CollectSettingsGapsExecutorDeps } from './internal/collect-settings-gaps.executor.js'
import { LoadSettingsExecutorDeps } from './internal/load-settings.executor.js'
import { RunHookScriptExecutorDeps } from './internal/run-hook-script.executor.js'
import { RunHooksForEventExecutorDeps } from './internal/run-hooks-for-event.executor.js'
import { RunLifecycleHooksExecutorDeps } from './internal/run-lifecycle-hooks.executor.js'
import { RunPostToolUseFailureHooksExecutorDeps } from './internal/run-post-tool-use-failure-hooks.executor.js'
import { RunPostToolUseHooksExecutorDeps } from './internal/run-post-tool-use-hooks.executor.js'
import { RunPreCompactHooksExecutorDeps } from './internal/run-pre-compact-hooks.executor.js'
import { RunPreToolUseHooksExecutorDeps } from './internal/run-pre-tool-use-hooks.executor.js'
import { RunSessionStartHooksExecutorDeps } from './internal/run-session-start-hooks.executor.js'
import { RunSessionSwitchHooksExecutorDeps } from './internal/run-session-switch-hooks.executor.js'
import { RunToolResultHooksExecutorDeps } from './internal/run-tool-result-hooks.executor.js'
import { RunUserPromptSubmitHooksExecutorDeps } from './internal/run-user-prompt-submit-hooks.executor.js'
import { SuperviseForkExecutorDeps } from './internal/supervise-fork.executor.js'

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
  Layer.provideMerge(TomlLoaderLive),
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
