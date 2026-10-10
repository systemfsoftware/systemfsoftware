import type * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as Context from 'effect/Context'

export interface WorkspaceShape {
  readonly driver: typeof NodeFileSystem
}

export class Workspace extends Context.Service<Workspace, WorkspaceShape>()('app/Workspace') {}
