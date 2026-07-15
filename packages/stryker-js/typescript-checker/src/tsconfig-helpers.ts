import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'

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
 * Determines whether or not to use `--build` mode based on "references" being there in the config file
 * @param tsconfigFileName The tsconfig file to parse
 */
export interface ParsedConfig {
  config?: unknown
  error?: Error
}

function stripJsonComments(json: string): string {
  return json
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

export function parseConfigFileTextToJson(fileName: string, jsonText: string): ParsedConfig {
  try {
    const stripped = stripJsonComments(jsonText)
    return { config: JSON.parse(stripped) }
  } catch (error) {
    return { error: error as Error }
  }
}

export function determineBuildModeEnabled(tsconfigFileName: string): boolean {
  const tsconfigFile = readFileSync(tsconfigFileName, 'utf-8')
  const parsed = parseConfigFileTextToJson(tsconfigFileName, tsconfigFile)
  if (parsed.error) {
    return false
  }
  const useProjectReferences = 'references' in (parsed.config as { references?: unknown[] })
  return useProjectReferences
}

/**
 * Overrides some options to speed up compilation and disable some code quality checks we don't want during mutation testing
 * @param parsedConfig The parsed config file
 * @param useBuildMode whether or not `--build` mode is used
 */
export function overrideOptions(parsedConfig: ParsedConfig, useBuildMode: boolean): string {
  const config = (parsedConfig.config ?? {}) as { compilerOptions?: Record<string, unknown> }
  const compilerOptions: Record<string, unknown> = {
    ...config.compilerOptions,
    ...COMPILER_OPTIONS_OVERRIDES,
    ...(useBuildMode ? LOW_EMIT_OPTIONS_FOR_PROJECT_REFERENCES : NO_EMIT_OPTIONS_FOR_SINGLE_PROJECT),
    // TypeScript 7 removed some legacy defaults that the upstream fixtures still use.
    target: 'es2022',
    moduleResolution: 'bundler',
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

interface ProjectReference {
  path: string
}

/**
 * Retrieves the referenced config files based on parsed configuration
 * @param parsedConfig The parsed config file
 * @param fromDirName The directory where to resolve from
 */
export function retrieveReferencedProjects(parsedConfig: ParsedConfig, fromDirName: string): string[] {
  const config = parsedConfig.config as { references?: ProjectReference[] } | undefined
  if (Array.isArray(config?.references)) {
    return config!.references.map((reference) => {
      let resolved = path.resolve(fromDirName, reference.path)
      if (!path.basename(resolved).endsWith('.json')) {
        resolved = path.join(resolved, 'tsconfig.json')
      }
      return toPosixFileName(resolved)
    })
  }
  return []
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
