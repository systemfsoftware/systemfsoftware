import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect, Layer, Schema } from 'effect'
import * as Match from 'effect/Match'
import { CliError, Command } from 'effect/unstable/cli'

import { makeCli } from './cli/command.js'
import { UnparsableCommandLine } from './cli/unparsable-command-line.schema.js'
import { layer as cliOutputBannerLayer } from './drivers/cli-output-banner.js'
import { layer as extractorDriversLayer } from './drivers/console-message-writer.js'
import { extractorVersion } from './version.js'

const appLayer = Layer.mergeAll(
  NodeServices.layer,
  extractorDriversLayer(),
  cliOutputBannerLayer(),
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
 *
 * The context is built once, under the root scope, before the command tree: every cell the CLI
 * binds runs with `R = never`, and the framework's own services are supplied from the same
 * context.
 */
const program = Effect.gen(function*() {
  const context = yield* Layer.build(appLayer)
  return yield* Command.run(makeCli(context), { version: extractorVersion }).pipe(
    Effect.catchIf(isUnparsableShowHelp, () => Effect.fail(new UnparsableCommandLine({}))),
    Effect.provideContext(context),
  )
})

NodeRuntime.runMain(Effect.scoped(program))
