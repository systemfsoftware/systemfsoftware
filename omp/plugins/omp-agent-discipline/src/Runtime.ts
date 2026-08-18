import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Layer, ManagedRuntime } from 'effect'
import * as PathModule from 'effect/Path'

const nodeLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  PathModule.layer,
  TomlLoaderLive.pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(PathModule.layer),
  ),
)

const runtime = ManagedRuntime.make(nodeLayer)

export default runtime
