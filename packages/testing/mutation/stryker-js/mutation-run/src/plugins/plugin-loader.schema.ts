import { Schema as S } from 'effect'

import { ExitClass } from '../exit-classification.js'

/**
 * The shape of a module namespace that contributes Stryker plugins:
 * an exported `strykerPlugins` array. Elements are runtime plugin objects,
 * so only array-ness is checked here.
 */
export const PluginModuleSchema = S.Struct({
  strykerPlugins: S.Array(S.Unknown),
})

/**
 * The shape of a module namespace that contributes a JSON schema
 * extension: an exported `strykerValidationSchema` record.
 */
export const SchemaValidationContributionSchema = S.Struct({
  strykerValidationSchema: S.Record(S.String, S.Unknown),
})

/**
 * A plugin the user explicitly asked for cannot be found.
 *
 * Discovery walking past an absent org directory is not this: that is expected
 * and silent. This tag exists for the case where the run was told to load a
 * named plugin and no module provides it, which the user has to fix.
 *
 * `exitClass` is a class member rather than a schema field, so the constant the
 * tag already determines is not restated at every construction site and cannot
 * ride the wire in a form that contradicts the tag.
 */
export class PluginNotFoundError extends S.TaggedError<PluginNotFoundError>()(
  'PluginNotFoundError',
  {
    descriptor: S.String,
  },
) {
  readonly exitClass = ExitClass.ConfigError
}

/**
 * The plugin module exists and threw while loading — a syntax error, or an
 * exception at import time.
 *
 * Kept distinct from absence because swallowing it would report the plugin's
 * own bug as "plugin not found", sending the user to look for a missing
 * dependency that is installed.
 */
export class PluginLoadFailedError extends S.TaggedError<PluginLoadFailedError>()(
  'PluginLoadFailedError',
  {
    descriptor: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = ExitClass.InternalError
}
