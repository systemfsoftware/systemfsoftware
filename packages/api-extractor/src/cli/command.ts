import { Command } from 'effect/unstable/cli'

import { initCommand } from './init-action.js'
import { runCommand } from './run-action.js'

export const cli = Command.make('api-extractor').pipe(
  Command.withDescription(
    'Analyze exported TypeScript declarations, emit .api.md reports, and generate .d.ts rollups',
  ),
  Command.withSubcommands([runCommand, initCommand]),
)
