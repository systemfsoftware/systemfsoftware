import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import type { Json } from 'effect/Schema'
import * as Struct from 'effect/Struct'
import type * as Ts from 'typescript'

import { dirname } from '../analyzer/path-helpers.js'
import { MissingMainEntryPointError } from '../errors/index.js'
import type { TsCompilerLoadError, TsConfigReadError } from '../errors/index.js'
import type {
  CompilerConfigurationOptions,
  CompilerHostOptions,
  CompilerLoadOptions,
  TypeScriptCompiler,
} from './typescript-compiler.service.js'

export interface CompilerStateOptions {
  /** The folder the config chain resolves against; the config base path when `overrideTsconfig` is used. */
  readonly projectFolder: string
  /** Read only when `overrideTsconfig` is absent (R25). */
  readonly tsconfigFilePath: string
  /** The compiler configuration itself; when present, `tsconfigFilePath` is never read (R25). */
  readonly overrideTsconfig?: Json | undefined
  readonly mainEntryPointFilePath: string
  readonly additionalEntryPoints?: readonly string[]
  readonly typescriptCompilerFolder?: string
  readonly skipLibCheck?: boolean
}

export interface CompilerState {
  readonly compiler: typeof Ts
  readonly program: Ts.Program
  readonly typeChecker: Ts.TypeChecker
  readonly entryPoints: readonly string[]
}

const declarationFilePattern = /\.d(\.[^./\\]+)?\.(c|m)?ts$/i

export const isDeclarationFile = (filePath: string): boolean => declarationFilePattern.test(filePath)

const sourceExtensionPattern = /^(.+)(\.[a-z0-9_]+)$/
const sourceExtensions: Readonly<Record<string, true>> = {
  '.ts': true,
  '.tsx': true,
  '.js': true,
  '.jsx': true,
}

const groupOf = (match: RegExpExecArray, index: number): string => match[index] ?? ''

const sourceParts = (filePath: string): Option.Option<{ readonly base: string; readonly extension: string }> =>
  Option.map(Option.fromNullishOr(sourceExtensionPattern.exec(filePath)), (match) => ({
    base: groupOf(match, 1),
    extension: groupOf(match, 2).toLowerCase(),
  }))

/**
 * The declaration a source file shadows: analysis reads a `.ts`/`.tsx`/`.js`/`.jsx` input
 * through its `.d.ts` sibling when the sibling exists, so the source itself is not an input.
 */
export const shadowingDeclaration = (filePath: string): Option.Option<string> =>
  Match.value(isDeclarationFile(filePath)).pipe(
    Match.when(true, () => Option.none<string>()),
    Match.when(
      false,
      () =>
        Option.flatMap(sourceParts(filePath), (parts) =>
          Match.value(sourceExtensions[parts.extension] === true).pipe(
            Match.when(true, () => Option.some(`${parts.base}.d.ts`)),
            Match.when(false, () => Option.none<string>()),
            Match.exhaustive,
          )),
    ),
    Match.exhaustive,
  )

/**
 * The files the program analyses: the case-insensitively deduplicated inputs, keeping only the
 * declarations analysis reads.
 */
export const collectAnalysisFiles = (filePaths: readonly string[]): readonly string[] =>
  Arr.dedupeWith(filePaths, (left, right) => left.toUpperCase() === right.toUpperCase()).filter(isDeclarationFile)

/** The inputs a program compiles: the tsconfig's file names plus the run's entry points. */
export const analysisInputs = dual<
  (tsconfigFileNames: readonly string[]) => (options: CompilerStateOptions) => readonly string[],
  (options: CompilerStateOptions, tsconfigFileNames: readonly string[]) => readonly string[]
>(2, (
  options: CompilerStateOptions,
  tsconfigFileNames: readonly string[],
): readonly string[] => [
  ...tsconfigFileNames,
  options.mainEntryPointFilePath,
  ...(options.additionalEntryPoints ?? []),
])

/**
 * The compiler options the program runs with: the tsconfig's options without the output
 * settings this engine never emits through, and `skipLibCheck` forced on when the run asks for
 * it and the tsconfig did not already ask.
 */
export const shapeCompilerOptions = dual<
  (skipLibCheck: boolean | undefined) => (options: Ts.CompilerOptions) => Ts.CompilerOptions,
  (options: Ts.CompilerOptions, skipLibCheck: boolean | undefined) => Ts.CompilerOptions
>(2, (
  options: Ts.CompilerOptions,
  skipLibCheck: boolean | undefined,
): Ts.CompilerOptions => {
  const cleaned: Ts.CompilerOptions = Struct.omit(options, ['outDir', 'declarationDir'])
  return Match.value(cleaned.skipLibCheck !== true && skipLibCheck === true).pipe(
    Match.when(true, () => ({ ...cleaned, skipLibCheck: true })),
    Match.when(false, () => cleaned),
    Match.exhaustive,
  )
})

const compilerLoadOptionsOf = (options: CompilerStateOptions): CompilerLoadOptions => ({
  typescriptCompilerFolder: options.typescriptCompilerFolder,
})

const compilerHostOptionsOf = (
  options: CompilerStateOptions,
  compilerOptions: Ts.CompilerOptions,
): CompilerHostOptions => ({
  compilerOptions,
  typescriptCompilerFolder: options.typescriptCompilerFolder,
})

/**
 * The configuration the program is built from: the override itself when the run supplies one —
 * resolved against the project folder — otherwise the file at `tsconfigFilePath`, resolved
 * against its own folder (R25). `tsconfigFilePath` is passed along either way; the driver reads
 * it only when no override is present.
 */
const compilerConfigurationOptionsOf = (options: CompilerStateOptions): CompilerConfigurationOptions =>
  Option.fromNullishOr(options.overrideTsconfig).pipe(
    Option.match({
      onNone: () => ({
        tsconfigFilePath: options.tsconfigFilePath,
        basePath: dirname(options.tsconfigFilePath),
      }),
      onSome: (overrideTsconfig) => ({
        overrideTsconfig,
        tsconfigFilePath: options.tsconfigFilePath,
        basePath: options.projectFolder,
      }),
    }),
  )

const missingEntryPoint = (options: CompilerStateOptions): MissingMainEntryPointError =>
  new MissingMainEntryPointError({ filePath: options.mainEntryPointFilePath })

/**
 * Compiles the state the analysis walks: the compiler the run resolves, the tsconfig (or the
 * overridden compiler configuration) it reads, and the program over the analysis files. Pure
 * sequencing over the compiler port — every sys call behind it lives in the driver that
 * provides the port. An unreadable tsconfig and a main entry point the program cannot load are
 * typed failures, never defects.
 */
export const loadCompilerState = dual<
  (
    options: CompilerStateOptions,
  ) => (
    compiler: TypeScriptCompiler,
  ) => Effect.Effect<CompilerState, TsConfigReadError | TsCompilerLoadError | MissingMainEntryPointError>,
  (
    compiler: TypeScriptCompiler,
    options: CompilerStateOptions,
  ) => Effect.Effect<CompilerState, TsConfigReadError | TsCompilerLoadError | MissingMainEntryPointError>
>(2, (
  compiler: TypeScriptCompiler,
  options: CompilerStateOptions,
): Effect.Effect<CompilerState, TsConfigReadError | TsCompilerLoadError | MissingMainEntryPointError> =>
  Effect.gen(function*() {
    const typescript = yield* compiler.loadCompiler(compilerLoadOptionsOf(options))
    const commandLine = yield* compiler.parseCompilerConfiguration(
      typescript,
      compilerConfigurationOptionsOf(options),
    )
    const shapedOptions = shapeCompilerOptions(commandLine.options, options.skipLibCheck)
    const analysisFiles = collectAnalysisFiles(analysisInputs(options, commandLine.fileNames))
    const host = yield* compiler.makeHost(typescript, compilerHostOptionsOf(options, shapedOptions))
    const program = compiler.createProgram(typescript, analysisFiles, shapedOptions, host)
    const state: CompilerState = {
      compiler: typescript,
      program,
      typeChecker: program.getTypeChecker(),
      entryPoints: analysisFiles,
    }
    const entryPoint = Option.fromUndefinedOr(program.getSourceFile(options.mainEntryPointFilePath))
    return yield* Effect.as(
      Effect.fromResult(Result.fromOption(entryPoint, () => missingEntryPoint(options))),
      state,
    )
  }))
