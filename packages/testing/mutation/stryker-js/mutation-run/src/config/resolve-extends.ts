import { createRequire } from 'node:module' // node:module — createRequire for specifier resolution, no Effect equivalent
import { pathToFileURL } from 'node:url' // node:url — pathToFileURL, no Effect Path equivalent

import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { ConfigDocumentSchema, ImportedModuleSchema } from './config-document.schema.js'
import { ConfigFileInvalidError, ConfigFileUnreadableError } from './config-reader.schema.js'
import type { ExtendsStepState } from './extends-step.js'
import { decideExtendsStep, initialExtendsStepState } from './extends-step.js'

export function readConfigFile(
  configFile: string,
): Effect.Effect<
  PartialStrykerOptions,
  ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const ext = pathService.extname(configFile).toLowerCase()
    if (ext === '.json') {
      const fs = yield* FileSystem.FileSystem
      const fileContent = yield* fs.readFileString(configFile).pipe(
        Effect.mapError((cause) => new ConfigFileUnreadableError({ file: configFile, cause })),
      )
      const parsed = yield* Effect.try({
        try: () => JSON.parse(fileContent) as unknown,
        catch: (cause) => new ConfigFileInvalidError({ file: configFile, cause }),
      })
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return yield* new ConfigFileInvalidError({ file: configFile, cause: 'Config must be a JSON object' })
      }
      return yield* S.decodeUnknownEffect(ConfigDocumentSchema)(parsed).pipe(
        Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
      )
    }
    const importResult = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(pathService.resolve(configFile)).toString()),
      catch: (cause) => new ConfigFileUnreadableError({ file: configFile, cause }),
    }).pipe(Effect.result)
    if (Result.isFailure(importResult)) {
      return yield* importResult.failure
    }
    const importedModule: unknown = importResult.success
    const exported = yield* S.decodeUnknownEffect(ImportedModuleSchema)(importedModule).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
      Effect.map((decoded) => decoded.default),
    )
    if (exported === undefined || exported === null || typeof exported !== 'object') {
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Default export of config file must be an object!',
      })
    }
    return yield* S.decodeUnknownEffect(ConfigDocumentSchema)(exported).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
    )
  })
}
function resolveExtendsSpecifier(
  specifier: string,
  configDir: string,
): Effect.Effect<string, ConfigFileUnreadableError, Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    return yield* Effect.try({
      try: () => {
        const requireFrom = createRequire(pathService.join(configDir, 'noop.js'))
        return requireFrom.resolve(specifier)
      },
      catch: (cause) => new ConfigFileUnreadableError({ file: specifier, cause }),
    })
  })
}

export function resolveExtends(
  configFile: string,
  document: PartialStrykerOptions,
): Effect.Effect<
  PartialStrykerOptions,
  ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const absolute = pathService.resolve(configFile)
    const loop = (
      state: ExtendsStepState,
      file: string,
      currentDocument: PartialStrykerOptions,
    ): Effect.Effect<
      PartialStrykerOptions,
      ConfigFileUnreadableError | ConfigFileInvalidError,
      FileSystem.FileSystem | Path.Path
    > =>
      Match.value(decideExtendsStep(state, currentDocument, file, pathService)).pipe(
        Match.tag('done', (d) => Effect.succeed(d.options)),
        Match.tag('read', (d) =>
          readConfigFile(d.path).pipe(Effect.flatMap((nextDocument) => loop(d.state, d.path, nextDocument)))),
        Match.tag('resolve', (d) =>
          resolveExtendsSpecifier(d.specifier, d.directory).pipe(
            Effect.flatMap((resolvedPath) =>
              readConfigFile(resolvedPath).pipe(Effect.flatMap((nextDocument) =>
                loop(d.state, resolvedPath, nextDocument)
              ))
            ),
          )),
        Match.tag('refused', (d) => {
          const message = d.reason === 'cycle'
            ? `Config inheritance cycle detected at "${d.file}"`
            : `Invalid config file "${d.file}". "extends" must be a string`
          return Effect.fail(new ConfigFileInvalidError({ file: d.file, cause: message }))
        }),
        Match.exhaustive,
      )
    return yield* loop(initialExtendsStepState, absolute, document)
  })
}
