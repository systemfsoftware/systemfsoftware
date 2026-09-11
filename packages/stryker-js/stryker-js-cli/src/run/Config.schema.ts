import * as S from 'effect/Schema'

export const ConfigDocumentSchema = S.Record(S.String, S.Unknown)

export const ImportedModuleSchema = S.Struct({
  default: S.optional(S.Unknown),
})

export class ConfigFileNotFoundError extends S.TaggedError<ConfigFileNotFoundError>()(
  'ConfigFileNotFoundError',
  {
    file: S.String,
  },
) {
  readonly exitClass = 'ConfigError' as const
}

export class ConfigFileUnreadableError extends S.TaggedError<ConfigFileUnreadableError>()(
  'ConfigFileUnreadableError',
  {
    file: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = 'ConfigError' as const
}

export class ConfigFileInvalidError extends S.TaggedError<ConfigFileInvalidError>()(
  'ConfigFileInvalidError',
  {
    file: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = 'ConfigError' as const
}

export class ConfigError extends S.TaggedError<ConfigError>()('ConfigError', {
  message: S.String,
}) {
  readonly exitClass = 'ConfigError' as const
}

export class ReadConfigCommand extends S.TaggedClass<ReadConfigCommand>()('ReadConfigCommand', {
  cliOptions: S.Record(S.String, S.Unknown),
  basePath: S.String,
}) {}

export class MergeCommand extends S.TaggedClass<MergeCommand>()('MergeCommand', {
  base: S.Record(S.String, S.Unknown),
  overrides: S.Record(S.String, S.Unknown),
}) {}

export class MergeResult extends S.TaggedClass<MergeResult>()('MergeResult', {
  merged: S.Record(S.String, S.Unknown),
}) {}
/**
 * The two config properties the host adds on top of the ABI's option schema:
 * the fork document's JSON Schema (`forkCoreSchema` in Config.ts) composes these
 * onto the ABI's own published option schema document, because the ABI
 * publishes the option shape as a `StandardSchemaV1` carrying no field
 * metadata.
 */
export const survivorsPriorReport = S.String.pipe(
  S.annotate({
    description:
      'The path of the prior mutation report a --survivors run admits against and re-tests the survivors of. Defaults to "reports/mutation-report.json" when unset. Deliberately has no default: a default would be injected into every resolved options object and written into every report, poisoning the KTD7 marker that identifies a report produced by a survivors run.',
  }),
)

export const extendsPropertySchema = S.String.pipe(
  S.annotate({
    description:
      'Path to another stryker config file whose options merge underneath this one. Resolved relative to this file. A child scalar or array replaces the inherited value; a child object merges one level deep; a child key set to null deletes the inherited key. Inheritance chains are not rewritten, so an inherited relative path value still resolves against the working directory of the run that reads it.',
  }),
)
