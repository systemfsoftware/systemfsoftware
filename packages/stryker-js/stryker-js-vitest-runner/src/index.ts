import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import * as S from 'effect/Schema'

import { makeVitestRunnerLayer } from './Runner.js'
import { VitestRunnerOptionsSchema } from './Runner.schema.js'

/**
 * The `vitest` test runner, as the plugin the engine loads.
 *
 * The declared layer asks for the run's resolved options and the sandbox it runs
 * in, so the requirement is visible in the type and an engine that does not
 * provide it fails to compile.
 */
export const strykerPlugins = [
  declarePlugin('TestRunner', 'vitest', makeVitestRunnerLayer()),
]

/**
 * The `vitest` option section as a JSON Schema document, for Stryker's option
 * validation — derived from the declaration, never read from a file. It is built
 * here, at the entry that contributes it, because a document is a *use* of a
 * schema and the schema module exports only declarations.
 */
export const strykerValidationSchema: Record<string, unknown> = S.toJsonSchemaDocument(
  S.Struct({ vitest: S.optional(VitestRunnerOptionsSchema) }),
).schema
