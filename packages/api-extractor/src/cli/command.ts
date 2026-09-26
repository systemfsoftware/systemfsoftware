import type * as Context from 'effect/Context'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import { Command } from 'effect/unstable/cli'

import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import type { MessageWriter } from '../message-writer.service.js'
import { DebugFlag } from './debug-flag.js'
import { makeInitCommand } from './init-action.js'
import { makeRunCommand } from './run-action.js'

/** The services the composition root builds once and binds every CLI cell with. */
export type CliServices = FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler

/**
 * The command tree the published `api-extractor` bin runs: `run` and `init`, with the root
 * `--debug/-d` global flag available to both. The tree is built from the cells the composition
 * root already bound to its context, so each handler only runs a cell whose services are never.
 */
export const makeCli = (context: Context.Context<CliServices>) =>
  Command.make('api-extractor').pipe(
    Command.withDescription(
      'Analyze exported TypeScript declarations, emit .api.md reports, and generate .d.ts rollups',
    ),
    Command.withSubcommands([makeRunCommand(context), makeInitCommand(context)]),
    Command.withGlobalFlags([DebugFlag]),
  )
