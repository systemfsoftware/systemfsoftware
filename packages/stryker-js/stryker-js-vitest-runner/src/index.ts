import { declarePlugin } from '@systemfsoftware/stryker-js'
import type { PluginModule } from '@systemfsoftware/stryker-js'
import * as S from 'effect/Schema'

import { makeTestRunner } from './Runner.js'
import { VitestRunnerOptionsSchema } from './Runner.schema.js'

export { makeTestRunner }

export const vitestRunner = declarePlugin('TestRunner', 'vitest', makeTestRunner)

export const strykerPlugins: PluginModule['strykerPlugins'] = [vitestRunner]

/**
 * The `vitest` option section as a JSON Schema document, for Stryker's option
 * validation — derived from the declaration, never read from a file. It is built
 * here, at the entry that contributes it, because a document is a *use* of a
 * schema and the schema module exports only declarations.
 */
export const strykerValidationSchema: Record<string, unknown> = S.toJsonSchemaDocument(
  S.Struct({ vitest: S.optional(VitestRunnerOptionsSchema) }),
).schema
