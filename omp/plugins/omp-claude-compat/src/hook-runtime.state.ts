import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { TomlLoader, TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { HookDispatcherExecutorDeps } from './hook-dispatcher.executor.js'
import { InjectInstructionsExecutorDeps } from './inject-instructions.executor.js'

/** Released when the runtime is disposed, which OMP triggers on SIGINT/SIGTERM. */
export const HookScopeLive = Layer.scoped(HookDispatcherExecutorDeps, Effect.scope)

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

const runtime = ManagedRuntime.make(
  HookScopeLive.pipe(
    Layer.provideMerge(InjectInstructionsDepsLive),
    Layer.provideMerge(TomlLoaderLive),
    Layer.provideMerge(nodeLayer),
  ),
)

export default runtime
