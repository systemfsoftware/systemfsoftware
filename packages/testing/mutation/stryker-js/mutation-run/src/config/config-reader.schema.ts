import * as S from 'effect/Schema'

import { ExitClass } from '../exit-classification.js'

/**
 * The config file the run was explicitly told to use does not exist.
 *
 * Separate from every other config failure because the reader branches on it:
 * an absent candidate in the default search order means keep looking, while an
 * absent file the user named by hand means stop. Only the caller knows which
 * situation it is in, which is why absence is its own tag rather than a flag.
 *
 * `exitClass` is a class member, not a schema field. As a field it would have to
 * be restated at every construction site — the same constant the tag already
 * determines — and it would ride the wire, letting a decoder accept an encoded
 * error whose class contradicts its own tag.
 */
export class ConfigFileNotFoundError extends S.TaggedError<ConfigFileNotFoundError>()(
  'ConfigFileNotFoundError',
  {
    file: S.String,
  },
) {
  readonly exitClass = ExitClass.ConfigError
}

/**
 * The file is present and cannot be read or imported — permissions, a
 * directory where a file was expected, a syntax error in a JavaScript config.
 *
 * Distinct from absence so the search stops here instead of walking past it:
 * treating an unreadable file as missing hides the user's own syntax error
 * behind "no config found".
 */
export class ConfigFileUnreadableError extends S.TaggedError<ConfigFileUnreadableError>()(
  'ConfigFileUnreadableError',
  {
    file: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = ExitClass.ConfigError
}

/** The file was read and its contents are not a valid configuration. */
export class ConfigFileInvalidError extends S.TaggedError<ConfigFileInvalidError>()(
  'ConfigFileInvalidError',
  {
    file: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = ExitClass.ConfigError
}

export class ConfigError extends S.TaggedError<ConfigError>()('ConfigError', {
  message: S.String,
}) {
  readonly exitClass = ExitClass.ConfigError
}
