import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { TomlLoader, TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { HookDispatcherExecutorDeps } from './hook-dispatcher.executor.js'
import { InjectInstructionsExecutorDeps } from './inject-instructions.executor.js'
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
  Layer.scoped(HookDispatcherExecutorDeps, Effect.scope),
  Layer.scoped(LoadSettingsExecutorDeps, Effect.scope),
  Layer.scoped(CollectSettingsGapsExecutorDeps, Effect.scope),
  Layer.scoped(RunHookScriptExecutorDeps, Effect.scope),
  Layer.scoped(RunHooksForEventExecutorDeps, Effect.scope),
  Layer.scoped(RunPreToolUseHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunPostToolUseHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunPostToolUseFailureHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunToolResultHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunPreCompactHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunUserPromptSubmitHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunSessionStartHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunSessionSwitchHooksExecutorDeps, Effect.scope),
  Layer.scoped(RunLifecycleHooksExecutorDeps, Effect.scope),
  Layer.scoped(SuperviseForkExecutorDeps, Effect.scope),
)

export const InjectInstructionsDepsLive = Layer.effect(
  InjectInstructionsExecutorDeps,
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem
    const path = yield* PathModule.Path
    const tomlLoader = yield* TomlLoader
    return { fileSystem, path, tomlLoader }
  }),
)

const nodeLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

const appLayer = HookScopeLive.pipe(
  Layer.provideMerge(InjectInstructionsDepsLive),
  Layer.provideMerge(TomlLoaderLive),
  Layer.provideMerge(nodeLayer),
)

export type HookRuntimeContext = Layer.Layer.Success<typeof appLayer>

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
