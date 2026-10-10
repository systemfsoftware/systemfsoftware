import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'

export interface WorkspaceShape {
  readonly read: (path: string) => Effect.Effect<string>
}

export class Workspace extends Context.Service<Workspace, WorkspaceShape>()('app/Workspace') {
  static readonly make = Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return Workspace.of({ read: (path) => Effect.orDie(fs.readFileString(path)) })
  })

  static readonly layer: Layer.Layer<Workspace> = Layer.effect(this, this.make).pipe(
    Layer.provide(NodeFileSystem.layer),
  )
}
