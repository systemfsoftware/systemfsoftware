import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'

import { parse } from '@std/jsonc'
import { Data, Result, Schema as S } from 'effect'
import semver from 'semver'

// Override some compiler options that have to do with code quality. When mutating, we're not interested in the resulting code quality
// See https://github.com/stryker-mutator/stryker-js/issues/391 for more info
const COMPILER_OPTIONS_OVERRIDES: Readonly<Record<string, unknown>> = Object.freeze({
  allowUnreachableCode: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
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
})

let cachedTSVersion: string | undefined

export function getTSVersion(): string {
  if (cachedTSVersion === undefined) {
    const require = createRequire(import.meta.url)
    const pkg = JSON.parse(
      readFileSync(require.resolve('typescript/package.json'), 'utf-8'),
    ) as { version: string }
    cachedTSVersion = pkg.version
  }
  return cachedTSVersion
}

export function guardTSVersion(version = getTSVersion()): void {
  if (!semver.satisfies(version, '>=7.0.0', { includePrerelease: true })) {
    throw new Error(
      `@systemfsoftware/stryker-js-typescript-checker only supports typescript@7.0.0 or higher. Found typescript@${version}`,
    )
  }
}

/**
 * Error returned when a tsconfig file fails to parse or does not match the shape this package consumes.
 */
export class TsConfigParseError extends Data.TaggedError('TsConfigParseError')<{
  readonly file: string
  readonly reason: string
}> {}

const JsonRecord = S.Record(S.String, S.Unknown)
const TsConfigSchema = S.StructWithRest(
  S.Struct({
    references: S.optional(S.Array(S.StructWithRest(S.Struct({ path: S.String }), [JsonRecord]))),
    compilerOptions: S.optional(JsonRecord),
  }),
  [JsonRecord],
)
type TsConfig = S.Schema.Type<typeof TsConfigSchema>

/**
 * Parses the raw text of a tsconfig file into a typed config, rejecting shapes this package cannot consume.
 * @param fileName The tsconfig file name, used for error reporting
 * @param jsonText The raw tsconfig content
 */
export function parseTsConfig(fileName: string, jsonText: string): Result.Result<TsConfig, TsConfigParseError> {
  // `@std/jsonc`'s whitespace set excludes U+FEFF, so it rejects a leading BOM, while `tsc` tolerates one.
  try {
    const value = parse(jsonText.replace(/^\uFEFF/, ''))
    // Rebuilds the object, reordering keys (declared fields hoist). Safe here: this
    // package only reads the config, and `overrideOptions` builds a fresh object anyway.
    // The core sibling (`packages/stryker-js/core/src/sandbox/parse-config-helper.ts`)
    // deliberately uses an `S.is` guard instead — it mutates the parsed config and writes
    // it back with `JSON.stringify`, so a rebuild there would reorder the user's tsconfig
    // on disk. Independent boundaries by KTD-2; this note keeps the divergence deliberate.
    return Result.mapError(
      S.decodeUnknownResult(TsConfigSchema)(value),
      (error) => new TsConfigParseError({ file: fileName, reason: error.message }),
    )
  } catch (error) {
    return Result.fail(
      new TsConfigParseError({
        file: fileName,
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

/**
 * Determines whether or not to use `--build` mode based on "references" being there in the config file
 * @param tsconfigFileName The tsconfig file to parse
 */
export function determineBuildModeEnabled(tsconfigFileName: string): boolean {
  const tsconfigFile = readFileSync(tsconfigFileName, 'utf-8')
  const parsed = parseTsConfig(tsconfigFileName, tsconfigFile)
  return Result.match(parsed, {
    onFailure: () => false,
    onSuccess: (config) => config.references !== undefined,
  })
}

/**
 * Overrides some options to speed up compilation and disable some code quality checks we don't want during mutation testing
 * @param config The parsed config file
 * @param useBuildMode whether or not `--build` mode is used
 */
export function overrideOptions(config: TsConfig, useBuildMode: boolean): string {
  // `target` and `moduleResolution` are deliberately absent: both belong to the consumer.
  // Forcing `moduleResolution` contradicts `module: NodeNext`/`Node16` (TS5095 + TS5109),
  // and forcing `target` hides lib features the consumer's own target allows (TS2550).
  const compilerOptions: Record<string, unknown> = {
    ...config.compilerOptions,
    ...COMPILER_OPTIONS_OVERRIDES,
    ...(useBuildMode ? LOW_EMIT_OPTIONS_FOR_PROJECT_REFERENCES : NO_EMIT_OPTIONS_FOR_SINGLE_PROJECT),
  }

  if (
    !useBuildMode &&
    compilerOptions['declarationDir'] !== undefined &&
    compilerOptions['declarationDir'] !== null
  ) {
    // because composite and/or declaration was disabled in non-build mode, we have to disable declarationDir as well
    // otherwise, error TS5069: Option 'declarationDir' cannot be specified without specifying option 'declaration' or option 'composite'.
    delete compilerOptions['declarationDir']
  }

  if (useBuildMode) {
    // Remove the options to place declarations files in different locations to decrease the complexity of searching the source file in the TypescriptCompiler class.
    delete compilerOptions['inlineSourceMap']
    delete compilerOptions['inlineSources']
    delete compilerOptions['mapRoute']
    delete compilerOptions['sourceRoot']
    delete compilerOptions['outFile']
  }

  return JSON.stringify({
    ...config,
    compilerOptions,
  })
}

/**
 * Retrieves the referenced config files based on parsed configuration
 * @param config The parsed config file
 * @param fromDirName The directory where to resolve from
 */
export function retrieveReferencedProjects(config: TsConfig, fromDirName: string): string[] {
  return (config.references ?? []).map((reference) => {
    let resolved = path.resolve(fromDirName, reference.path)
    if (!path.basename(resolved).endsWith('.json')) {
      resolved = path.join(resolved, 'tsconfig.json')
    }
    return toPosixFileName(resolved)
  })
}

/**
 * Replaces backslashes with forward slashes (used by typescript)
 * @param fileName The file name that may contain backslashes `\`
 * @returns posix and ts complaint file name (with `/`)
 */
export function toPosixFileName(fileName: string): string {
  return fileName.replace(/\\/g, '/')
}

/**
 * Find source file in declaration file
 * @param content The content of the declaration file
 * @returns URL of the source file or undefined if not found
 */
const findSourceMapRegex = /\/\/# sourceMappingURL=(.+)$/m
export function getSourceMappingURL(content: string): string | undefined {
  findSourceMapRegex.lastIndex = 0
  return findSourceMapRegex.exec(content)?.[1]
}
