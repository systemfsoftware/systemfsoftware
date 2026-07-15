import { readFileSync } from 'fs'

import { declareFactoryPlugin, PluginKind } from '@stryker-mutator/api/plugin'

import { create } from './typescript-checker.js'

export const strykerPlugins = [
  declareFactoryPlugin(PluginKind.Checker, 'typescript', create),
]

export const createTypescriptChecker = create

export const strykerValidationSchema: Record<string, unknown> = JSON.parse(
  readFileSync(
    new URL('../schema/typescript-checker-options.json', import.meta.url),
    'utf-8',
  ),
)
