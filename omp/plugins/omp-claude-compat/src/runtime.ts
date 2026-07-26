import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import * as PathModule from '@effect/platform/Path'
import { Layer, ManagedRuntime } from 'effect'

const nodeLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

const runtime = ManagedRuntime.make(nodeLayer)

export default runtime
