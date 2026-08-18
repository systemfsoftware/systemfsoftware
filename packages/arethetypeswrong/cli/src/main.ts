#!/usr/bin/env node
import { layer as nodeChildProcessSpawnerLayer } from '@effect/platform-node-shared/NodeChildProcessSpawner'
import { layer as nodeFileSystemLayer } from '@effect/platform-node-shared/NodeFileSystem'
import { layer as nodePathLayer } from '@effect/platform-node-shared/NodePath'
import { layer as nodeStdioLayer } from '@effect/platform-node-shared/NodeStdio'
import { layer as nodeTerminalLayer } from '@effect/platform-node-shared/NodeTerminal'
import { runMain as nodeRunMain } from '@effect/platform-node/NodeRuntime'
import { Effect, Layer } from 'effect'
import { layer as cliConfigLayerFactory } from 'effect/unstable/cli/CliConfig'
import * as Command from 'effect/unstable/cli/Command'

import { AttwConfigFileLayer } from './AttwConfigExecutor.js'
import { attwCommand } from './AttwHandler.js'
import { FilesystemLive } from './FilesystemAdapter.js'
import { PackRunnerLive } from './PackRunnerAdapter.js'
import { StdinLive } from './StdinAdapter.js'
import { TerminalLive } from './TerminalAdapter.js'

const cliConfigLayer = Layer.provideMerge(cliConfigLayerFactory(), AttwConfigFileLayer)

const main = Command.runWith(attwCommand, { version: '1.1.1' })

const cliLayer = Layer.mergeAll(TerminalLive, FilesystemLive, StdinLive)

const nodeBase = Layer.mergeAll(nodeFileSystemLayer, nodePathLayer, nodeTerminalLayer, nodeStdioLayer)
const nodeSpawnerLayer = nodeChildProcessSpawnerLayer.pipe(Layer.provide(nodeBase))

const nodeRuntime = Layer.mergeAll(
  nodeBase,
  nodeSpawnerLayer,
  PackRunnerLive.pipe(Layer.provide(nodeSpawnerLayer)),
)

const program = main(process.argv.slice(2)).pipe(
  Effect.withLogSpan('attw'),
)

const provided = program.pipe(
  Effect.provide(Layer.provideMerge(Layer.mergeAll(cliLayer, cliConfigLayer), nodeRuntime)),
)

nodeRunMain(provided)
