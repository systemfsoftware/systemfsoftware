import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export interface WorkspaceShape {
  readonly read: (path: string) => Effect.Effect<string>
}

export class Workspace extends Context.Service<Workspace, WorkspaceShape>()('app/Workspace') {
  static readonly make = Effect.map(
    Effect.promise(() => import('node:fs/promises')),
    (fs) => Workspace.of({ read: (path) => Effect.promise(() => fs.readFile(path, 'utf8')) }),
  )

  static readonly layer = Layer.effect(this, this.make)
}
