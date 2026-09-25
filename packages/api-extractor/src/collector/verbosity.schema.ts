import * as Schema from 'effect/Schema'

export const Verbosity = Schema.Literals(['silent', 'normal', 'verbose', 'diagnostics'])
export type Verbosity = typeof Verbosity.Type

export const CliFlags = Schema.Struct({
  quiet: Schema.optional(Schema.Boolean),
  verbose: Schema.optional(Schema.Boolean),
  diagnostics: Schema.optional(Schema.Boolean),
})
export type CliFlags = typeof CliFlags.Type

export const VerbosityRequest = Schema.Struct({
  cliFlags: CliFlags,
  configQuiet: Schema.optional(Schema.Boolean),
})
export type VerbosityRequest = typeof VerbosityRequest.Type
