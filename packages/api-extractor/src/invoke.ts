import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { layer } from './drivers/console-message-writer.js'
import { type ExtractorResult, type ExtractorRunOptions, runEffect } from './extractor.js'

// The console driver is the writer bound at this edge: every write is
// `Effect.sync`, so a run's console lines never suspend the fiber that emits
// them. A Terminal-backed writer under NodeServices is asynchronous and would
// turn those emissions into AsyncFiberError defects.
const NodeLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  layer(),
)

export const invoke = (
  configFilePath: string,
  options: ExtractorRunOptions = {},
): Promise<ExtractorResult> =>
  Effect.runPromise(
    Effect.provide(runEffect(configFilePath, options), NodeLive),
  )
