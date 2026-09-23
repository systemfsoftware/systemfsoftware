import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type * as Terminal from 'effect/Terminal'
import { Command } from 'effect/unstable/cli'
import type { UserError } from 'effect/unstable/cli/CliError'

import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import type { MessageWriter } from '../message-writer.service.js'
import { initCommand } from './init-action.js'
import { runCommand } from './run-action.js'

type CliServices = FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler | Terminal.Terminal

type NoFlags = Record<never, never>

export const cli: Command.Command<'api-extractor', NoFlags, NoFlags, UserError, CliServices> = Command.make(
  'api-extractor',
).pipe(
  Command.withDescription(
    'Analyze exported TypeScript declarations, emit .api.md reports, and generate .d.ts rollups',
  ),
  Command.withSubcommands([runCommand, initCommand]),
)
