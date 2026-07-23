import { NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Effect, Layer, ManagedRuntime } from 'effect'

export const nodeLayer = NodeFileSystem.layer.pipe(
  Layer.provideMerge(PathModule.layer),
)

export interface AppRuntime {
  runSync<A, E>(effect: Effect.Effect<A, E, FileSystem | PathModule.Path>): A
}

export function createRuntime(): AppRuntime {
  return ManagedRuntime.make(nodeLayer)
}
