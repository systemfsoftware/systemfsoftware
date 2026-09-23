import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Struct from 'effect/Struct'
import type * as Ts from 'typescript'

import type { TsCompilerLoadError, TsConfigReadError } from '../errors/index.js'
import type { CompilerHostOptions, CompilerLoadOptions, TypeScriptCompiler } from './typescript-compiler.service.js'

export interface CompilerStateOptions {
  readonly projectFolder: string
  readonly tsconfigFilePath: string
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
export const analysisInputs = (
  options: CompilerStateOptions,
  tsconfigFileNames: readonly string[],
): readonly string[] => [
  ...tsconfigFileNames,
  options.mainEntryPointFilePath,
  ...(options.additionalEntryPoints ?? []),
]

/**
 * The compiler options the program runs with: the tsconfig's options without the output
 * settings this engine never emits through, and `skipLibCheck` forced on when the run asks for
 * it and the tsconfig did not already ask.
 */
export const shapeCompilerOptions = (
  options: Ts.CompilerOptions,
  skipLibCheck: boolean | undefined,
): Ts.CompilerOptions => {
  const cleaned: Ts.CompilerOptions = Struct.omit(options, ['outDir', 'declarationDir'])
  return Match.value(cleaned.skipLibCheck !== true && skipLibCheck === true).pipe(
    Match.when(true, () => ({ ...cleaned, skipLibCheck: true })),
    Match.when(false, () => cleaned),
    Match.exhaustive,
  )
}

const compilerLoadOptionsOf = (options: CompilerStateOptions): CompilerLoadOptions => ({
  projectFolder: options.projectFolder,
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
 * Compiles the state the analysis walks: the compiler the run resolves, the tsconfig it reads,
 * and the program over the analysis files. Pure sequencing over the compiler port — every sys
 * call behind it lives in the driver that provides the port.
 */
export const loadCompilerState = (
  compiler: TypeScriptCompiler,
  options: CompilerStateOptions,
): Effect.Effect<CompilerState, TsConfigReadError | TsCompilerLoadError> =>
  Effect.gen(function*() {
    const typescript = yield* compiler.loadCompiler(compilerLoadOptionsOf(options))
    const commandLine = yield* compiler.readTsconfig(typescript, options.tsconfigFilePath)
    const shapedOptions = shapeCompilerOptions(commandLine.options, options.skipLibCheck)
    const analysisFiles = collectAnalysisFiles(analysisInputs(options, commandLine.fileNames))
    const host = yield* compiler.makeHost(typescript, compilerHostOptionsOf(options, shapedOptions))
    const program = compiler.createProgram(typescript, analysisFiles, shapedOptions, host)
    return {
      compiler: typescript,
      program,
      typeChecker: program.getTypeChecker(),
      entryPoints: analysisFiles,
    }
  })
