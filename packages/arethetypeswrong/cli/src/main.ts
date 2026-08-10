#!/usr/bin/env node
import { defaultLayer as cliConfigDefaultLayer } from '@effect/cli/CliConfig'
import * as Command from '@effect/cli/Command'
import { layer as nodeCommandExecutorLayer } from '@effect/platform-node-shared/NodeCommandExecutor'
import { layer as nodeFileSystemLayer } from '@effect/platform-node-shared/NodeFileSystem'
import { layer as nodePathLayer } from '@effect/platform-node-shared/NodePath'
import { runMain as nodeRunMain } from '@effect/platform-node-shared/NodeRuntime'
import { layer as nodeTerminalLayer } from '@effect/platform-node-shared/NodeTerminal'
import { Effect, Layer, Logger, LogLevel } from 'effect'

import { AttwConfigFileLayer } from './attw-config.schema.js'
import { attwCommand } from './attw.handler.js'
import { CliFilesystem as Filesystem, FilesystemLive } from './filesystem.adapter.js'
import { PackRunnerLive } from './pack-runner.adapter.js'
import { Stdin, StdinLive } from './stdin.adapter.js'
import { Terminal, TerminalLive } from './terminal.adapter.js'

const cliConfigLayer = Layer.provideMerge(cliConfigDefaultLayer, AttwConfigFileLayer)

const main = Command.run({
  name: 'attw',
  version: '1.1.1',
})(attwCommand)

const cliLayer = Layer.mergeAll(TerminalLive, FilesystemLive, StdinLive)

const nodeRuntime = Layer.mergeAll(
  nodeFileSystemLayer,
  nodePathLayer,
  nodeTerminalLayer,
  nodeCommandExecutorLayer.pipe(Layer.provide(nodeFileSystemLayer)),
  PackRunnerLive.pipe(
    Layer.provide(nodeCommandExecutorLayer.pipe(Layer.provide(nodeFileSystemLayer))),
  ),
)

const program = main(process.argv).pipe(
  Effect.withLogSpan('attw'),
  Logger.withMinimumLogLevel(LogLevel.Info),
)

const provided = program.pipe(
  Effect.provide(Layer.provideMerge(Layer.mergeAll(cliLayer, cliConfigLayer), nodeRuntime)),
)

nodeRunMain(provided)
