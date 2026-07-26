import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import * as PathModule from '@effect/platform/Path'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Layer, ManagedRuntime } from 'effect'

const nodeLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

const runtime = ManagedRuntime.make(TomlLoaderLive.pipe(Layer.provideMerge(nodeLayer)))

export default runtime
