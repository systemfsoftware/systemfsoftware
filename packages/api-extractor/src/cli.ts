import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { Command } from 'effect/unstable/cli'

import { cli } from './cli/command.js'
import { messageWriterLayer } from './drivers/console-message-writer.js'
import { layer as typescriptCompilerLayer } from './drivers/typescript-compiler.js'
import { extractorVersion } from './version.js'

const cliLayers = Layer.mergeAll(
  NodeServices.layer,
  messageWriterLayer(),
  typescriptCompilerLayer,
)

const program = Command.run(cli, { version: extractorVersion }).pipe(
  Effect.provide(cliLayers),
)

NodeRuntime.runMain(program)
