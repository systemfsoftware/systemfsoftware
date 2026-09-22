import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as NodePath from '@effect/platform-node/NodePath'
import * as NodeTerminal from '@effect/platform-node/NodeTerminal'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { type ExtractorResult, type ExtractorRunOptions, runEffect } from './extractor.js'

const NodeLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  NodeTerminal.layer,
)

export const invoke = (
  configFilePath: string,
  options: ExtractorRunOptions = {},
): Promise<ExtractorResult> =>
  Effect.runPromise(
    Effect.provide(runEffect(configFilePath, options), NodeLive),
  )
