import { Schema } from 'effect'

export const AttwConfigSchema = Schema.Struct({
  ignoreRules: Schema.optional(Schema.Array(Schema.String)),
  ignoreResolutions: Schema.optional(
    Schema.Array(Schema.Literals(['node10', 'node16-cjs', 'node16-esm', 'bundler'])),
  ),
  format: Schema.optional(Schema.Literals(['auto', 'table', 'table-flipped', 'ascii', 'json'])),
  quiet: Schema.optional(Schema.Boolean),
  summary: Schema.optional(Schema.Boolean),
  emoji: Schema.optional(Schema.Boolean),
  color: Schema.optional(Schema.Boolean),
  entrypoints: Schema.optional(Schema.Array(Schema.String)),
  includeEntrypoints: Schema.optional(Schema.Array(Schema.String)),
  excludeEntrypoints: Schema.optional(Schema.Array(Schema.String)),
  entrypointsLegacy: Schema.optional(Schema.Boolean),
  fromNpm: Schema.optional(Schema.Boolean),
  pack: Schema.optional(Schema.Boolean),
  registry: Schema.optional(Schema.String),
})
export type AttwConfig = Schema.Schema.Type<typeof AttwConfigSchema>
