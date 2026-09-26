import * as Schema from 'effect/Schema'

import { CliFlags } from './collector/verbosity.schema.js'

export const ExtractorRunOptions = Schema.Struct({
  localBuild: Schema.optional(Schema.Boolean),
  printApiReportDiff: Schema.optional(Schema.Boolean),
  typescriptCompilerFolder: Schema.optional(Schema.String),
  cliFlags: Schema.optional(CliFlags),
  configAutoLocated: Schema.optional(Schema.Boolean),
})

export type ExtractorRunOptions = typeof ExtractorRunOptions.Type
