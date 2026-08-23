import { readFileSync } from 'fs'

import { Checker } from '@systemfsoftware/stryker-js-plugin-api/check'
import { declarePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'

import { HybridFileSystem } from './project/hybrid-file-system.js'
import { makeCheckerService } from './typescript-checker.js'
import { TypescriptCompiler } from './typescript-compiler.js'

export const strykerPlugins = [
  declarePlugin(
    PluginKind.Checker,
    'typescript',
    Layer.effect(
      Checker,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        const fs = new HybridFileSystem()
        const compiler = new TypescriptCompiler(options, fs)
        return makeCheckerService({ options, compiler })
      }),
    ),
  ),
]

export { TypescriptChecker } from './typescript-checker.js'

const rawSchema: unknown = JSON.parse(
  readFileSync(new URL('../schema/typescript-checker-options.json', import.meta.url), 'utf-8'),
)
if (!S.is(S.Record(S.String, S.Unknown))(rawSchema)) {
  throw new Error('Invalid typescript-checker schema file')
}
export const strykerValidationSchema: Record<string, unknown> = rawSchema
