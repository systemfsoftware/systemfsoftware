import * as Command from 'effect/cli/Command'
import * as Effect from 'effect/Effect'

import { readCliManifest } from './init/cli-manifest.js'
import { initCommand } from './init/init.command.js'
import { runCommand } from './run/run.command.js'

export const cli = (manifestUrl: URL) =>
  Effect.flatMap(readCliManifest(manifestUrl), ({ version }) =>
    Command.make('effect-e2e').pipe(
      Command.withDescription('Effect-native end-to-end testing'),
      Command.withSubcommands([initCommand(manifestUrl), runCommand]),
      Command.run({ version }),
    ))
