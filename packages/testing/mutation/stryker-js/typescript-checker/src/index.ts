import rawSchemaJson from '../schema/typescript-checker-options.json' with { type: 'json' }

import { Checker } from '@systemfsoftware/stryker-js/Checker'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'

import { makeCheckerService } from './Checker.js'
import { makeHybridFileSystem, makeTypescriptCompiler } from './Compiler.js'

export const strykerPlugins = [
  declarePlugin(
    'Checker',
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

const rawSchema: unknown = rawSchemaJson
if (!S.is(S.Record(S.String, S.Unknown))(rawSchema)) {
  throw new Error('Invalid typescript-checker schema file')
}
export const strykerValidationSchema: Record<string, unknown> = rawSchema
