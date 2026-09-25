import { Context } from 'effect'
import type * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'
import type * as Ts from 'typescript'

import type { TsCompilerLoadError, TsConfigReadError } from '../errors/index.js'

export interface CompilerLoadOptions {
  readonly typescriptCompilerFolder?: string | undefined
}

export interface CompilerHostOptions {
  readonly compilerOptions: Ts.CompilerOptions
  readonly typescriptCompilerFolder?: string | undefined
}

/**
 * The configuration the program is built from: `overrideTsconfig` when present, the file at
 * `tsconfigFilePath` otherwise. `basePath` is the folder the configuration's relative paths
 * resolve against.
 */
export interface CompilerConfigurationOptions {
  readonly overrideTsconfig?: Schema.Json | undefined
  readonly tsconfigFilePath: string | undefined
  readonly basePath: string
}

export interface TypeScriptCompiler {
  readonly loadCompiler: (options: CompilerLoadOptions) => Effect.Effect<typeof Ts, TsCompilerLoadError>
  readonly parseCompilerConfiguration: (
    compiler: typeof Ts,
    options: CompilerConfigurationOptions,
  ) => Effect.Effect<Ts.ParsedCommandLine, TsConfigReadError>
  readonly makeHost: (compiler: typeof Ts, options: CompilerHostOptions) => Effect.Effect<Ts.CompilerHost>
  readonly createProgram: (
    compiler: typeof Ts,
    files: readonly string[],
    compilerOptions: Ts.CompilerOptions,
    host: Ts.CompilerHost,
  ) => Ts.Program
}

export const TypeScriptCompiler = Context.Service<TypeScriptCompiler>(
  '@systemfsoftware/api-extractor/TypeScriptCompiler',
)
