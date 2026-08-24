import path from 'node:path'

import { parse } from '@std/jsonc'
import { errorToString, normalizeFileName, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'

import { readContent } from '../project/project-file.js'
import type { Project } from '../project/project.js'

import { ExitClass } from '../exit-classification.js'
import { type FilePreprocessor } from './file-preprocessor.js'
import { ExtendsArraySchema, type TSConfig, TsConfigParseError, TsConfigSchema } from './parse-config.schema.js'

export type { TSConfig } from './parse-config.schema.js'

/**
 * Parses a JSONC string into a typed tsconfig.
 *
 * Inline replacement for `ts.parseConfigFileTextToJson()` removed in TypeScript 7:
 * delegates to `@std/jsonc` and shape-checks with an Effect Schema guard so
 * consumers receive a config already narrowed to the fields this package rewrites.
 *
 * @param fileName — used only for error message context (mirrors upstream behaviour).
 * @param jsonText — the raw tsconfig text, possibly containing comments.
 * @returns `Result.success(config)` when the text parses and matches the shape,
 *          `Result.failure(TsConfigParseError)` on a parse failure or a shape mismatch.
 */
export function parseTsConfig(
  fileName: string,
  jsonText: string,
): Result.Result<TSConfig, TsConfigParseError> {
  let parsed: unknown
  try {
    // `@std/jsonc` rejects a leading BOM (its whitespace set is ` \t\r\n`) but
    // `tsc` accepts one, so strip it before parsing.
    parsed = parse(jsonText.replace(/^\uFEFF/, ''))
  } catch (error) {
    return Result.fail(
      new TsConfigParseError({
        file: fileName,
        reason: errorToString(error),
        exitClass: ExitClass.ConfigError,
      }),
    )
  }
  if (S.is(TsConfigSchema)(parsed)) {
    // A type guard, not a decode: it returns the same object reference with the key
    // order untouched, so the preprocessor can mutate the config in place and write
    // it back without reordering or dropping keys.
    return Result.succeed(parsed)
  }
  return Result.fail(
    new TsConfigParseError({
      file: fileName,
      reason: `parsed to ${JSON.stringify(parsed)}, which does not match the tsconfig shape this package consumes`,
      exitClass: ExitClass.ConfigError,
    }),
  )
}

export const makeTSConfigPreprocessor =
  (log: Logger, options: StrykerOptions, basePath: string): FilePreprocessor => (project) => {
    if (options.inPlace) {
      return Effect.void
    }
    const touched = new Set<string>()

    const tryRewriteReference = (reference: string, originTSConfigFileName: string): string | false => {
      const fileName = path.resolve(path.dirname(originTSConfigFileName), reference)
      const relativeToSandbox = path.relative(basePath, fileName)
      if (relativeToSandbox.startsWith('..')) {
        return ['..', '..', normalizeFileName(reference)].join('/')
      }
      return false
    }

    const rewriteFileArrayProperty = (
      config: TSConfig,
      tsconfigFileName: string,
      prop: 'exclude' | 'files' | 'include',
    ): void => {
      const value = config[prop]
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const entry = value[i]
          if (typeof entry === 'string') {
            const rewritten = tryRewriteReference(entry, tsconfigFileName)
            if (rewritten) {
              value[i] = rewritten
            }
          }
        }
      }
    }

    const rewriteTSConfigFile = (
      tsconfigFileName: string,
    ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
      if (touched.has(tsconfigFileName)) {
        return Effect.void
      }
      touched.add(tsconfigFileName)
      const tsconfigFile = project.files.get(tsconfigFileName)
      if (!tsconfigFile) {
        return Effect.void
      }
      return Effect.flatMap(
        readContent(tsconfigFile),
        (content) =>
          Effect.flatMap(Effect.sync(() => parseTsConfig(tsconfigFileName, content)), (parsed) => {
            if (Result.isSuccess(parsed)) {
              const config = parsed.success
              return Effect.all(
                [
                  rewriteExtends(config, tsconfigFileName),
                  rewriteProjectReferences(config, tsconfigFileName),
                ],
                { discard: true },
              ).pipe(
                Effect.flatMap(() =>
                  Effect.sync(() => {
                    rewriteFileArrayProperty(config, tsconfigFileName, 'include')
                    rewriteFileArrayProperty(config, tsconfigFileName, 'exclude')
                    rewriteFileArrayProperty(config, tsconfigFileName, 'files')
                    Object.assign(tsconfigFile, { content: JSON.stringify(config, null, 2) })
                  })
                ),
              )
            }
            const reason = parsed.failure.reason
            return Effect.sync(() =>
              log.warn(
                `Could not rewrite tsconfig file "${tsconfigFileName}": ${reason}. Its extends, project references, and file array properties were not rewritten for the sandbox, so this file still points at paths outside it.`,
              )
            )
          }),
      )
    }

    const rewriteExtendsEntry = (
      config: TSConfig,
      extend: string,
      tsconfigFileName: string,
    ): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> => {
      const rewritten = tryRewriteReference(extend, tsconfigFileName)
      if (rewritten) {
        return Effect.succeed(rewritten)
      }
      return rewriteTSConfigFile(path.resolve(path.dirname(tsconfigFileName), extend)).pipe(Effect.as(extend))
    }

    const rewriteExtends = (
      config: TSConfig,
      tsconfigFileName: string,
    ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
      const extend = config.extends
      if (typeof extend === 'string') {
        return Effect.flatMap(rewriteExtendsEntry(config, extend, tsconfigFileName), (rewritten) => {
          config.extends = rewritten
          return Effect.void
        })
      }
      if (S.is(ExtendsArraySchema)(extend)) {
        return Effect.forEach(extend, (entry) => rewriteExtendsEntry(config, entry, tsconfigFileName)).pipe(
          Effect.flatMap((rewritten) => {
            config.extends = rewritten
            return Effect.void
          }),
        )
      }
      return Effect.void
    }

    const rewriteProjectReferences = (
      config: TSConfig,
      originTSConfigFileName: string,
    ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> => {
      const references = config.references
      if (!references) {
        return Effect.void
      }
      return Effect.forEach(references, (ref) => {
        const rewritten = tryRewriteReference(ref.path, originTSConfigFileName)
        if (rewritten) {
          ref.path = rewritten
          return Effect.void
        }
        const refPath = ref.path.endsWith('.json') ? ref.path : `${ref.path}/tsconfig.json`
        const refFileName = path.resolve(path.dirname(originTSConfigFileName), refPath)
        return rewriteTSConfigFile(refFileName)
      }).pipe(Effect.asVoid)
    }

    return rewriteTSConfigFile(path.resolve(options.tsconfigFile))
  }
