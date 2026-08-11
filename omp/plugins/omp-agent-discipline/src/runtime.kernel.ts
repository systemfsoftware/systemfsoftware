import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as PathModule from '@effect/platform/Path'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils/toml-loader'
import { Layer, ManagedRuntime } from 'effect'

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
