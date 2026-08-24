import { pathToFileURL } from 'node:url'

import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'

import { ConfigDocumentSchema } from './config-document.schema.js'
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
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Config must be a JSON object',
      })
    }
    const recordSchema = S.Record(S.String, S.Unknown)
    return yield* S.decodeUnknownEffect(recordSchema)(parsed).pipe(
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
    const hasDefaultExport = importedModule !== null && typeof importedModule === 'object' &&
      'default' in importedModule
    if (hasDefaultExport) {
      const maybeOptions: unknown = Reflect.get(importedModule, 'default')
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
    }
    log.fatal(
      `Invalid config file. It is missing a default export. ${
        describeNamedExports(importedModule)
      }\n${CONFIG_SYNTAX_HELP}`,
    )
    return yield* new ConfigFileInvalidError({
      file: configFile,
      cause: 'Config file must have a default export!',
    })
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
  const namedExports: string[] = typeof importedModule === 'object' && importedModule !== null
    ? Object.keys(importedModule)
    : []
  if (namedExports.length === 0) {
    return "In fact, it didn't export anything."
  }
  return `Found named export(s): ${new Intl.ListFormat('en').format(namedExports.map((name) => `"${name}"`))}.`
}
