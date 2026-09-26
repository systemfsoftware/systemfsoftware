import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect, Layer, Schema } from 'effect'
import * as Match from 'effect/Match'
import { CliError, Command } from 'effect/unstable/cli'

import { layer as bannerFormatterLayer } from './cli/banner-formatter.layer.js'
import { cli } from './cli/command.js'
import { UnparsableCommandLine } from './cli/unparsable-command-line.schema.js'
import { layer as extractorDriversLayer } from './drivers/console-message-writer.js'
import { extractorVersion } from './version.js'

const cliLayers = Layer.mergeAll(
  NodeServices.layer,
  extractorDriversLayer(),
  bannerFormatterLayer,
)

const isUnparsableShowHelp = (failure: unknown): failure is CliError.ShowHelp =>
  Match.value(failure).pipe(
    Match.when(Schema.is(CliError.ShowHelp), (help) => help.errors.length > 0),
    Match.orElse(() => false),
  )

/**
 * The framework renders a parse failure and reports its exit code as 1; upstream's
 * ts-command-line reports 2 for the same command line, so the failure is re-carried with that
 * code. A plain help request keeps the framework's code, because it carries no parse errors.
 */
const program = Command.run(cli, { version: extractorVersion }).pipe(
  Effect.provide(cliLayers),
  Effect.catchIf(isUnparsableShowHelp, () => Effect.fail(new UnparsableCommandLine({}))),
)

NodeRuntime.runMain(program)
