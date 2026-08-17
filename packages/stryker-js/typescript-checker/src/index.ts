import { readFileSync } from 'fs'

import { declareFactoryPlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Schema as S } from 'effect'

import { create } from './typescript-checker.js'

export const strykerPlugins = [
  declareFactoryPlugin(PluginKind.Checker, 'typescript', create),
]

export const createTypescriptChecker = create

export const strykerValidationSchema: Record<string, unknown> = S.decodeUnknownSync(
  S.Record(S.String, S.Unknown),
)(JSON.parse(
  readFileSync(
    new URL('../schema/typescript-checker-options.json', import.meta.url),
    'utf-8',
  ),
))
