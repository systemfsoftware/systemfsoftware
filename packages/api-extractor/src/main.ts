import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { Command } from 'effect/unstable/cli'

import { cli } from './cli/command.js'
import { layer as extractorDriversLayer } from './drivers/console-message-writer.js'
import { extractorVersion } from './version.js'

/**
 * The composition root: Node platform services plus the console message writer and the bundled
 * TypeScript compiler driver, bound once. `Command.run` renders the CLI's own failures, so a
 * failed extraction outcome exits 1 with its message, and a typed error exits 1 with its message;
 * `--debug` widens a typed error's text to its full cause.
 */
const cliLayers = Layer.mergeAll(
  NodeServices.layer,
  extractorDriversLayer(),
)

const program = Command.run(cli, { version: extractorVersion }).pipe(
  Effect.provide(cliLayers),
)

NodeRuntime.runMain(program)
