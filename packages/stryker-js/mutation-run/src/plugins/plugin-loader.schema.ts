import { Schema as S } from 'effect'

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
