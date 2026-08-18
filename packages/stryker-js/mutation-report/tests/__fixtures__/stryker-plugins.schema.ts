/**
 * The shape the built `./stryker-plugins` entry must expose. The test reads a
 * dynamically imported module, so the module namespace arrives as `unknown` and
 * a schema is the only way to narrow it without a cast.
 */
import * as S from 'effect/Schema'

export const PluginDeclarationSchema = S.Struct({
  kind: S.String,
  name: S.String,
})

export const PluginRegistrySchema = S.Struct({
  strykerPlugins: S.Array(PluginDeclarationSchema),
})
