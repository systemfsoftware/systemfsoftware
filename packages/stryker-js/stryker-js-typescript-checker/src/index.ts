import rawSchemaJson from '../schema/typescript-checker-options.json' with { type: 'json' }

import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import type { PluginModule } from '@systemfsoftware/stryker-js/Plugin'

import { makeChecker } from './Checker.js'

export { makeChecker }

export const typescriptChecker = declarePlugin('Checker', 'typescript', makeChecker)

export const strykerPlugins: PluginModule['strykerPlugins'] = [typescriptChecker]

export const strykerValidationSchema: Record<string, unknown> = rawSchemaJson
