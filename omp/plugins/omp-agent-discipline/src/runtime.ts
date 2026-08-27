import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { HarnessPolicyLive } from '@systemfsoftware/effect-harness-policy'
import type { HarnessPolicy } from '@systemfsoftware/effect-harness-policy'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Layer } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import * as PathModule from 'effect/Path'

export type DisciplineContext = FileSystem.FileSystem | PathModule.Path | HarnessPolicy

const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
const appLayer = Layer.mergeAll(nodeLayer, HarnessPolicyLive.pipe(Layer.provideMerge(nodeLayer)))

export const { runtime, runSafe } = bootstrapPluginRuntime(appLayer)
