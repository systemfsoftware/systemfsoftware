import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { CommandExecutor } from '@effect/platform/CommandExecutor'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Effect, Layer, ManagedRuntime } from 'effect'

export const nodeLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

export interface AppRuntime {
  runSync<A, E>(effect: Effect.Effect<A, E, CommandExecutor | FileSystem | PathModule.Path>): A
  runPromise<A, E>(effect: Effect.Effect<A, E, CommandExecutor | FileSystem | PathModule.Path>): Promise<A>
}

export function createRuntime(): AppRuntime {
  return ManagedRuntime.make(nodeLayer)
}
