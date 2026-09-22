import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { ConsoleMessageWriter } from './collector/console-message-writer.js'
import { MessageWriter } from './collector/message-router.js'
import { type ExtractorResult, type ExtractorRunOptions, runEffect } from './extractor.js'

// The ported Collector emits log lines fire-and-forget from synchronous
// analysis code (Effect.runSync), so the writer bound at this edge must be
// synchronous: the Terminal-backed writer from NodeServices is asynchronous
// and turns those emits into AsyncFiberError defects. The console writer
// keeps every write `Effect.sync`.
const NodeLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  Layer.succeed(MessageWriter, ConsoleMessageWriter),
)

export const invoke = (
  configFilePath: string,
  options: ExtractorRunOptions = {},
): Promise<ExtractorResult> =>
  Effect.runPromise(
    Effect.provide(runEffect(configFilePath, options), NodeLive),
  )
