import { readFileSync } from 'fs'

import { Checker } from '@systemfsoftware/stryker-js-plugin-api/check'
import { declarePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'

import { makeHybridFileSystem } from './project/hybrid-file-system.js'
import { makeCheckerService } from './typescript-checker.js'
import { makeTypescriptCompiler } from './typescript-compiler.js'

export const strykerPlugins = [
  declarePlugin(
    PluginKind.Checker,
    'typescript',
    Layer.effect(
      Checker,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        const fsService = yield* FileSystem.FileSystem
        const pathService = yield* Path.Path
        const fs = yield* makeHybridFileSystem(fsService)
        const compiler = makeTypescriptCompiler(options, fs, fsService, pathService)
        return makeCheckerService({ options, compiler })
      }),
    ),
  ),
]

const rawSchema: unknown = JSON.parse(
  readFileSync(new URL('../schema/typescript-checker-options.json', import.meta.url), 'utf-8'),
)
if (!S.is(S.Record(S.String, S.Unknown))(rawSchema)) {
  throw new Error('Invalid typescript-checker schema file')
}
export const strykerValidationSchema: Record<string, unknown> = rawSchema
