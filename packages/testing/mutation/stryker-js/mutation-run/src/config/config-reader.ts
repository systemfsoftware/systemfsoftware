import { pathToFileURL } from 'node:url'

import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { ConfigDocumentSchema, ImportedModuleSchema } from './config-document.schema.js'
import { SUPPORTED_CONFIG_FILE_NAMES } from './config-file-formats.js'
import { mergeRecords } from './config-merge.workflow.js'
import { ConfigFileInvalidError, ConfigFileNotFoundError, ConfigFileUnreadableError } from './config-reader.schema.js'
import { importModule } from './module-loader.js'
import type { ValidationSchemaDocument } from './options-validator.js'
import { validateOptions } from './options-validator.js'
import { resolveExtends } from './resolve-extends.js'

export const CONFIG_SYNTAX_HELP = `
Example of how a config file should look:
/**
  * @type {import('@systemfsoftware/stryker-js-plugin-api/core').StrykerOptions}
  */
export default {
  // You're options here!
}

Or using commonjs:
/**
  * @type {import('@systemfsoftware/stryker-js-plugin-api/core').StrykerOptions}
  */
module.exports = {
  // You're options here!
}

See https://stryker-mutator.io/docs/stryker-js/config-file for more information.`.trim()

function exists(fileName: string): Effect.Effect<boolean, ConfigFileUnreadableError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.access(fileName).pipe(
      Effect.as(true),
      Effect.catchTag('PlatformError', (error) =>
        Match.value(error.reason).pipe(
          Match.tag('NotFound', () => Effect.succeed(false)),
          Match.orElse(() => Effect.fail(new ConfigFileUnreadableError({ file: fileName, cause: error }))),
        )),
      Effect.mapError((error) => new ConfigFileUnreadableError({ file: fileName, cause: error })),
    )
  })
}
function findConfigFile(
  configFileName: unknown,
): Effect.Effect<string | undefined, ConfigFileNotFoundError | ConfigFileUnreadableError, FileSystem.FileSystem> {
  // CLI plumbing, not config document validation: `configFile` is `string | undefined`
  // from `PartialStrykerOptions` (the CLI option). This branch decides
  // "explicit file vs. auto-search", not whether a document is valid.
  // A schema decode (`S.String`) would be pedantic here and change nothing.
  if (typeof configFileName === 'string') {
    return exists(configFileName).pipe(
      Effect.flatMap((doesExist) =>
        doesExist
          ? Effect.succeed(configFileName)
          : Effect.fail(new ConfigFileNotFoundError({ file: configFileName }))
      ),
    )
  }
  return Effect.gen(function*() {
    for (const fileName of SUPPORTED_CONFIG_FILE_NAMES) {
      const doesExist = yield* exists(fileName)
      if (doesExist) {
        return fileName
      }
    }
    return undefined
  })
}

function readJsonConfig(
  configFile: string,
): Effect.Effect<
  Record<string, unknown>,
  ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem
> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const fileContent = yield* fs.readFileString(configFile).pipe(
      Effect.mapError((cause) => new ConfigFileUnreadableError({ file: configFile, cause })),
    )
    const parsed = yield* Effect.try({
      try: () => JSON.parse(fileContent) as unknown,
      catch: (cause) => new ConfigFileInvalidError({ file: configFile, cause }),
    })
    // Hand-written `null`/`typeof`/`Array.isArray` record check replaced by
    // `ConfigDocumentSchema` decode: `S.Record(S.String, S.Unknown)` at
    // `repos/effect/packages/effect/src/Schema.ts:3948` decides object-ness and
    // is the single boundary for JSON config documents.
    return yield* S.decodeUnknownEffect(ConfigDocumentSchema)(parsed).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
    )
  })
}

function importJSConfigModule(
  configFile: string,
  basePath: string,
): Effect.Effect<unknown, ConfigFileUnreadableError, Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const url = pathToFileURL(pathService.resolve(configFile)).toString()
    return yield* importModule(url, basePath).pipe(
      Effect.mapError((cause) => new ConfigFileUnreadableError({ file: configFile, cause })),
    )
  })
}

function importJSConfig(
  configFile: string,
  log: Logger,
  basePath: string,
): Effect.Effect<Record<string, unknown>, ConfigFileUnreadableError | ConfigFileInvalidError, Path.Path> {
  return Effect.gen(function*() {
    const importedModule = yield* importJSConfigModule(configFile, basePath)
    // `'default' in` narrowing replaced by `ImportedModuleSchema` decode
    // (`S.Struct` at `repos/effect/packages/effect/src/Schema.ts:3568`,
    // `S.optional` at `repos/effect/packages/effect/src/Schema.ts:2498`).
    // A decode failure (e.g. namespace not an object) is treated as missing
    // default so the named-export hint is still produced.
    const decodedResult = S.decodeUnknownResult(ImportedModuleSchema)(importedModule)
    if (Result.isFailure(decodedResult)) {
      log.fatal(
        `Invalid config file. It is missing a default export. ${
          describeNamedExports(importedModule)
        }\n${CONFIG_SYNTAX_HELP}`,
      )
      return yield* new ConfigFileInvalidError({ file: configFile, cause: decodedResult.failure })
    }
    const decodedModule = decodedResult.success
    const maybeOptions = decodedModule.default
    if (maybeOptions === undefined) {
      log.fatal(
        `Invalid config file. It is missing a default export. ${
          describeNamedExports(importedModule)
        }\n${CONFIG_SYNTAX_HELP}`,
      )
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Config file must have a default export!',
      })
    }
    // Tailored fatal for function vs non-object: `ImportedModuleSchema` keeps
    // `default` as `S.Unknown` so this distinction survives. Decoding `default`
    // as `S.Record` would collapse both to a generic schema error and lose the
    // "Exporting a function is no longer supported" hint.
    if (typeof maybeOptions !== 'object' || maybeOptions === null) {
      if (typeof maybeOptions === 'function') {
        log.fatal(
          `Invalid config file. Exporting a function is no longer supported. Please export an object with your configuration instead, or use a "stryker.conf.json" file.\n${CONFIG_SYNTAX_HELP}`,
        )
      } else {
        log.fatal(
          `Invalid config file. It must export an object, found a "${typeof maybeOptions}"!\n${CONFIG_SYNTAX_HELP}`,
        )
      }
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Default export of config file must be an object!',
      })
    }
    const keys = Object.keys(maybeOptions)
    if (keys.length === 0) {
      log.warn(`Stryker options were empty. Did you forget to export options from ${configFile}?`)
    }
    const decoded = yield* S.decodeUnknownEffect(ConfigDocumentSchema)(maybeOptions).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
    )
    return { ...decoded }
  })
}

function loadOptionsFromConfigFile(
  cliOptions: PartialStrykerOptions,
  log: Logger,
  basePath: string,
): Effect.Effect<
  Record<string, unknown>,
  ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return findConfigFile(cliOptions['configFile']).pipe(
    Effect.flatMap((configFile) => {
      if (configFile === undefined) {
        log.info('No config file specified. Running with command line arguments.')
        log.info('Use `stryker init` command to generate your config file.')
        return Effect.succeed({})
      }
      log.debug(`Loading config from ${configFile}`)
      return Effect.gen(function*() {
        const pathService = yield* Path.Path
        const ext = pathService.extname(configFile).toLowerCase()
        const child = ext === '.json'
          ? yield* readJsonConfig(configFile)
          : yield* importJSConfig(configFile, log, basePath)
        // Cheap presence test to avoid async `resolveExtends` when no `extends`
        // key is present. Validation of `extends` value (must be string) happens
        // inside `resolveExtends` via schema; this `in` check is just a fast
        // path, not a shape predicate a schema would decide.
        if (!('extends' in child)) {
          return child
        }
        return yield* resolveExtends(configFile, child)
      })
    }),
  )
}

export function readConfig(
  cliOptions: PartialStrykerOptions,
  log: Logger,
  schema: ValidationSchemaDocument,
  basePath: string,
): Effect.Effect<
  StrykerOptions,
  ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return loadOptionsFromConfigFile(cliOptions, log, basePath).pipe(
    Effect.flatMap((options) => {
      const merged: Record<string, unknown> = mergeRecords(options, cliOptions)
      return validateOptions(merged, schema, log).pipe(
        Effect.mapError((cause) => new ConfigFileInvalidError({ file: 'options', cause })),
        Effect.tap((validated) =>
          Effect.sync(() => {
            if (log.isDebugEnabled()) {
              log.debug(`Loaded config: ${JSON.stringify(validated, null, 2)}`)
            }
          })
        ),
      )
    }),
  )
}

function describeNamedExports(importedModule: unknown): string {
  // Introspection for the "missing default export" hint, not validation:
  // lists named exports so the operator knows what the module did export.
  const namedExports: string[] = typeof importedModule === 'object' && importedModule !== null
    ? Object.keys(importedModule)
    : []
  if (namedExports.length === 0) {
    return "In fact, it didn't export anything."
  }
  return `Found named export(s): ${new Intl.ListFormat('en').format(namedExports.map((name) => `"${name}"`))}.`
}
