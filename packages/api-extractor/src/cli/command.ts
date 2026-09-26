import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import { Command } from 'effect/unstable/cli'

import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import type { MessageWriter } from '../message-writer.service.js'
import { DebugFlag } from './debug-flag.js'
import { initCommand } from './init-action.js'
import type { CliReportedError } from './reported-failure.schema.js'
import { runCommand } from './run-action.js'

type CliServices = FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler

type NoFlags = Record<never, never>

/**
 * The command tree the published `api-extractor` bin runs: `run` and `init`, with the root
 * `--debug/-d` global flag available to both. Built here, launched only by `src/main.ts`.
 */
export const cli: Command.Command<'api-extractor', NoFlags, NoFlags, CliReportedError, CliServices> = Command.make(
  'api-extractor',
).pipe(
  Command.withDescription(
    'Analyze exported TypeScript declarations, emit .api.md reports, and generate .d.ts rollups',
  ),
  Command.withSubcommands([runCommand, initCommand]),
  Command.withGlobalFlags([DebugFlag]),
)
