import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { Command } from 'effect/unstable/cli'

import { initCommand } from './cli/init-action.js'
import { runCommand } from './cli/run-action.js'
import { layer } from './drivers/console-message-writer.js'
import { extractorVersion } from './extractor.js'

export const cli = Command.make('api-extractor').pipe(
  Command.withDescription(
    'Analyze exported TypeScript declarations, emit .api.md reports, and generate .d.ts rollups',
  ),
  Command.withSubcommands([runCommand, initCommand]),
)

const cliLayers = Layer.mergeAll(
  NodeServices.layer,
  layer(),
)

const program = Command.run(cli, { version: extractorVersion }).pipe(
  Effect.provide(cliLayers),
)

NodeRuntime.runMain(program)
