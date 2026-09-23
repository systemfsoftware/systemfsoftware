import { Context } from 'effect'
import type * as Effect from 'effect/Effect'
import type * as Ts from 'typescript'

import type { TsCompilerLoadError, TsConfigReadError } from '../errors/index.js'

export interface CompilerLoadOptions {
  readonly projectFolder: string
  readonly typescriptCompilerFolder?: string | undefined
}

export interface CompilerHostOptions {
  readonly compilerOptions: Ts.CompilerOptions
  readonly typescriptCompilerFolder?: string | undefined
}

export interface TypeScriptCompiler {
  readonly loadCompiler: (options: CompilerLoadOptions) => Effect.Effect<typeof Ts, TsCompilerLoadError>
  readonly readTsconfig: (
    compiler: typeof Ts,
    tsconfigFilePath: string,
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
