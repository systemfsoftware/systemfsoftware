/**
 * Config — schema declarations for the Config capability.
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'

export const ConfigDocumentSchema = S.Record(S.String, S.Unknown)

export const ImportedModuleSchema = S.Struct({
  default: S.optional(S.Unknown),
})

/**
 * The config file the run was explicitly told to use does not exist.
 */
export class ConfigFileNotFoundError extends S.TaggedError<ConfigFileNotFoundError>()(
  'ConfigFileNotFoundError',
  {
    file: S.String,
  },
) {
  readonly exitClass = 'ConfigError' as const
}

/**
 * The file is present and cannot be read or imported — permissions, a
 * directory where a file was expected, a syntax error in a JavaScript config.
 */
export class ConfigFileUnreadableError extends S.TaggedError<ConfigFileUnreadableError>()(
  'ConfigFileUnreadableError',
  {
    file: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = 'ConfigError' as const
}

/** The file was read and its contents are not a valid configuration. */
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
  cliOptions: Wire.mint(S.Record(Wire.mint(S.String), Wire.mint(S.Unknown))), // plugin sections are foreign by design
  basePath: S.String,
}) {}

export class MergeCommand extends S.TaggedClass<MergeCommand>()('MergeCommand', {
  base: S.Record(S.String, S.Unknown),
  overrides: S.Record(S.String, S.Unknown),
}) {}

export class MergeResult extends S.TaggedClass<MergeResult>()('MergeResult', {
  merged: S.Record(S.String, S.Unknown),
}) {}
export const survivorsPriorReport = S.optionalKey(
  S.String.pipe(
    S.annotate({
      description:
        'The path of the prior mutation report a --survivors run admits against and re-tests the survivors of. Defaults to "reports/mutation-report.json" when unset. Deliberately has no default: a default would be injected into every resolved options object and written into every report, poisoning the KTD7 marker that identifies a report produced by a survivors run.',
    }),
  ),
)

export const extendsPropertySchema = S.optionalKey(
  S.String.pipe(
    S.annotate({
      description:
        'Path to another stryker config file whose options merge underneath this one. Resolved relative to this file. A child scalar or array replaces the inherited value; a child object merges one level deep; a child key set to null deletes the inherited key. Inheritance chains are not rewritten, so an inherited relative path value still resolves against the working directory of the run that reads it.',
    }),
  ),
)

/**
 * Config-file names the rebuild removed, mapped to their remediation.
 * Kept private to this schema module — Config.ts owns the exported copy
 * that the validation layer reads; this copy only filters the schema fields.
 */
const REMOVED_OPTIONS: Record<string, string> = {
  'dots': 'the "dots" reporter was removed; use "clear-text" instead',
  'event-recorder':
    'the "event-recorder" reporter was removed; use the "json" reporter or the machine-mode progress stream for structured output',
  'progress-append-only': 'the "progress-append-only" reporter was removed; use "progress-stream" instead',
  'dashboard':
    'the "dashboard" reporter and its options were removed; write the "json" or "html" report and publish it yourself',
  'eventReporter': 'the event-recorder reporter was removed; remove this option',
}

/**
 * The option document schema, composed from the single `StrykerOptionsSchema` the plugin-api declares.
 * Removed options are dropped so their defaults do not leak into resolved options.
 */
export const forkOptionsSchema = S.StructWithRest(
  S.Struct({
    ...Object.fromEntries(
      Object.entries(StrykerOptionsSchema.schema.fields).filter(
        ([name]) => !Object.hasOwn(REMOVED_OPTIONS, name),
      ),
    ),
    survivorsPriorReport,
    extends: extendsPropertySchema,
  }),
  [Wire.mint(S.Record(Wire.mint(S.String), Wire.mint(S.Unknown)))], // plugin sections are foreign by design
)
