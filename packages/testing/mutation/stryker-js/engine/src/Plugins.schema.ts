/**
 * Plugins capability — declarations for plugin module shapes and load failures.
 */

import { Schema as S } from 'effect'

export const PluginModuleSchema = S.Struct({
  strykerPlugins: S.Array(S.Unknown),
})

export const SchemaValidationContributionSchema = S.Struct({
  strykerValidationSchema: S.Record(S.String, S.Unknown),
})

export class PluginNotFoundError extends S.TaggedError<PluginNotFoundError>()(
  'PluginNotFoundError',
  {
    descriptor: S.String,
  },
) {
  readonly exitClass = 'ConfigError' as const
}

export class PluginLoadFailedError extends S.TaggedError<PluginLoadFailedError>()(
  'PluginLoadFailedError',
  {
    descriptor: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = 'InternalError' as const
}
