import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { ProjectConfigLive } from '@systemfsoftware/omp-platform'
import { Layer, ManagedRuntime } from 'effect'
import * as PathModule from 'effect/Path'

const nodeLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  PathModule.layer,
  ProjectConfigLive.pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(PathModule.layer),
  ),
)

const runtime = ManagedRuntime.make(nodeLayer)

export default runtime
