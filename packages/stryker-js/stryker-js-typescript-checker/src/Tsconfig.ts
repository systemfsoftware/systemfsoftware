/**
 * Tsconfig — capability for reading and normalizing TypeScript project configs.
 *
 * Normalizes via Effect Schema and tightens compilation options for mutation
 * checking (disabling quality checks, toggling emit for build-mode vs
 * single-project).
 */
import { parse } from '@std/jsonc'
import { normalizeFileName } from '@systemfsoftware/stryker-js/Mutant'
import { Predicate, Result, Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'

import { type TsConfig, TsConfigParseError, TsConfigSchema } from './Tsconfig.schema.js'

// Override some compiler options that have to do with code quality. When mutating, we're not interested in the resulting code quality
// See https://github.com/stryker-mutator/stryker-js/issues/391 for more info
const COMPILER_OPTIONS_OVERRIDES: Readonly<Record<string, unknown>> = Object.freeze({
  allowUnreachableCode: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
  skipLibCheck: true,
})

// When we're running in 'single-project' mode, we can safely disable emit
const NO_EMIT_OPTIONS_FOR_SINGLE_PROJECT: Readonly<Record<string, unknown>> = Object.freeze({
  noEmit: true,
  incremental: false, // incremental and composite off: https://github.com/microsoft/TypeScript/issues/36917
  tsBuildInfoFile: undefined,
  composite: false,
})

// When we're running in 'project references' mode, we need to enable declaration output
const LOW_EMIT_OPTIONS_FOR_PROJECT_REFERENCES: Readonly<Record<string, unknown>> = Object.freeze({
  emitDeclarationOnly: true,
  noEmit: false,
  declarationMap: true,
  declaration: true,
  composite: true,
})

const reasonOfThrown = (error: unknown): string =>
  Match.value(error).pipe(
    Match.when(Predicate.isError, (thrown) => thrown.message),
    Match.when(Predicate.isString, (thrown) => thrown),
    Match.orElse((thrown) =>
      Option.match(Option.filter(Option.fromUndefinedOr(JSON.stringify(thrown)), (text) => text.length > 0), {
        onNone: () => 'a non-Error value was thrown',
        onSome: (text) => text,
      })
    ),
  )

/**
 * Parses the raw text of a tsconfig file into a typed config, rejecting shapes this package cannot consume.
 * @param fileName The tsconfig file name, used for error reporting
 * @param jsonText The raw tsconfig content
 */
export function parseTsConfig(fileName: string, jsonText: string): Result.Result<TsConfig, TsConfigParseError> {
  try {
    const value = parse(jsonText.replace(/^\uFEFF/, ''))
    return Result.mapError(
      S.decodeUnknownResult(TsConfigSchema)(value),
      (error) => new TsConfigParseError({ file: fileName, reason: error.message }),
    )
  } catch (error) {
    return Result.fail(new TsConfigParseError({ file: fileName, reason: reasonOfThrown(error) }))
  }
}

/** Whether `--build` mode should be enabled based on `references` in the tsconfig. */
export const determineBuildModeEnabled = (
  tsconfigFileName: string,
  fsService: FileSystem.FileSystem,
): Effect.Effect<boolean, unknown> =>
  Effect.gen(function*() {
    const tsconfigFile = yield* fsService.readFileString(tsconfigFileName)
    const parsed = parseTsConfig(tsconfigFileName, tsconfigFile)
    return Result.match(parsed, {
      onFailure: () => false,
      onSuccess: (config) => config.references !== undefined,
    })
  })

const withCompilerOverrides = (
  config: TsConfig,
  extraOptions: Readonly<Record<string, unknown>>,
): Record<string, unknown> => ({
  ...config.compilerOptions,
  ...COMPILER_OPTIONS_OVERRIDES,
  ...extraOptions,
})

const projectReferencesJson = (config: TsConfig): string => {
  const compilerOptions = withCompilerOverrides(config, LOW_EMIT_OPTIONS_FOR_PROJECT_REFERENCES)
  // Remove the options to place declarations files in different locations to decrease the complexity of searching the source file in the TypescriptCompiler class.
  delete compilerOptions['inlineSourceMap']
  delete compilerOptions['inlineSources']
  delete compilerOptions['mapRoute']
  delete compilerOptions['sourceRoot']
  delete compilerOptions['outFile']
  return JSON.stringify({ ...config, compilerOptions })
}

const singleProjectJson = (config: TsConfig): string => {
  const compilerOptions = withCompilerOverrides(config, NO_EMIT_OPTIONS_FOR_SINGLE_PROJECT)
  // composite and/or declaration was disabled in non-build mode, we have to disable declarationDir as well
  // otherwise, error TS5069: Option 'declarationDir' cannot be specified without specifying option 'declaration' or option 'composite'.
  if (compilerOptions['declarationDir'] !== null) {
    delete compilerOptions['declarationDir']
  }
  const { references: _references, ...withoutReferences } = config
  return JSON.stringify({ ...withoutReferences, compilerOptions })
}

/**
 * Overrides compiler options to speed up compilation and disable code quality
 * checks irrelevant during mutation testing.
 */
export function overrideOptions(config: TsConfig, useBuildMode: boolean): string {
  if (useBuildMode) {
    return projectReferencesJson(config)
  }
  return singleProjectJson(config)
}

/**
 * Retrieves the referenced config files based on parsed configuration.
 */
export function retrieveReferencedProjects(
  config: TsConfig,
  fromDirName: string,
  pathService: Path.Path,
): string[] {
  return (config.references ?? []).map((reference) => {
    let resolved = pathService.resolve(fromDirName, reference.path)
    if (!pathService.basename(resolved).endsWith('.json')) {
      resolved = pathService.join(resolved, 'tsconfig.json')
    }
    return normalizeFileName(resolved)
  })
}
