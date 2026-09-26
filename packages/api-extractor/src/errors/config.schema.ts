import { Option, Predicate, Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'

import { SchemaViolation } from '../config/schema-violation.schema.js'

/**
 * A configuration file search that found nothing: the folder the walk started at and the
 * candidate names it tried in each ancestor folder, so the refusal can name all three.
 */
export class ConfigFileNotFound extends Schema.TaggedError<ConfigFileNotFound>()('ConfigFileNotFound', {
  startFolder: Schema.String,
  candidateNames: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `Unable to find an api-extractor.json file: no ${
      this.candidateNames.join(' or ')
    } under ${this.startFolder} or any parent folder`
  }
}

/** A configuration file whose text is not valid JSON. */
export class ConfigJsonSyntaxError extends Schema.TaggedError<ConfigJsonSyntaxError>()('ConfigJsonSyntaxError', {
  filePath: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return Option.match(
      Option.filter(Option.fromNullishOr(this.cause), Predicate.isString),
      {
        onNone: () => `Error loading ${this.filePath}: the file could not be parsed as JSON`,
        onSome: (text) => `Error loading ${this.filePath}: ${text}`,
      },
    )
  }
}

/** A merged configuration record that does not satisfy the configuration schema. */
export class ConfigSchemaValidationError extends Schema.TaggedError<ConfigSchemaValidationError>()(
  'ConfigSchemaValidationError',
  {
    filePath: Schema.String,
    violations: Schema.Array(SchemaViolation),
  },
) {
  override get message(): string {
    const detail = Arr.map(
      this.violations,
      (violation) => `\nError: #${violation.instancePath}\n       ${violation.message}`,
    ).join('')
    return `JSON validation failed:\n${this.filePath}\n${detail}`
  }
}

/**
 * A path setting whose tokens do not survive expansion: an unknown token name, a `<lookup>` or
 * `<projectFolder>` that upstream only allows in specific positions, or a stray bracket.
 */
export class UnresolvedTokenError extends Schema.TaggedError<UnresolvedTokenError>()('UnresolvedTokenError', {
  fieldName: Schema.String,
  kind: Schema.Literals(['unrecognized', 'lookup', 'projectFolderNotFirst', 'extraCharacters']),
  detail: Schema.String,
}) {
  override get message(): string {
    return Match.value(this.kind).pipe(
      Match.when(
        'unrecognized',
        () => `The "${this.fieldName}" value contains an unrecognized token "${this.detail}"`,
      ),
      Match.when('lookup', () => `The "${this.fieldName}" value incorrectly uses the "<lookup>" token`),
      Match.when(
        'projectFolderNotFirst',
        () =>
          `The "${this.fieldName}" value incorrectly uses the "<projectFolder>" token.` +
          ` It must appear at the start of the string.`,
      ),
      Match.when(
        'extraCharacters',
        () => `The "${this.fieldName}" value contains extra token characters ("<" or ">"): ${this.detail}`,
      ),
      Match.exhaustive,
    )
  }
}

/** A configuration file that reaches itself through its `extends` chain. */
export class CircularConfigExtendsError extends Schema.TaggedError<CircularConfigExtendsError>()(
  'CircularConfigExtendsError',
  {
    chain: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return `The API Extractor "extends" setting contains a cycle.  This file is included twice: "${
      this.chain[this.chain.length - 1] ?? this.chain.join(' -> ')
    }"`
  }
}

/** An `extends` specifier that Node module resolution could not resolve from the configuration's folder. */
export class ConfigExtendsResolutionError extends Schema.TaggedError<ConfigExtendsResolutionError>()(
  'ConfigExtendsResolutionError',
  {
    specifier: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  override get message(): string {
    return `Error resolving NodeJS path "${this.specifier}": ${
      Option.match(Option.fromNullishOr(this.cause), {
        onNone: () => 'the specifier could not be resolved',
        onSome: (found) => found instanceof Error ? found.message : 'the specifier could not be resolved',
      })
    }`
  }
}

export class MainEntryPointNotDeclarationError extends Schema.TaggedError<MainEntryPointNotDeclarationError>()(
  'MainEntryPointNotDeclarationError',
  {
    filePath: Schema.String,
  },
) {
  override get message(): string {
    return `The "mainEntryPointFilePath" value is not a declaration file: ${this.filePath}`
  }
}

/** The declaration file the configuration names is not on disk (upstream's prepare-time check). */
export class MainEntryPointNotFoundError extends Schema.TaggedError<MainEntryPointNotFoundError>()(
  'MainEntryPointNotFoundError',
  {
    filePath: Schema.String,
  },
) {
  override get message(): string {
    return `The "mainEntryPointFilePath" path does not exist: ${this.filePath}`
  }
}

export class ProjectFolderLookupError extends Schema.TaggedError<ProjectFolderLookupError>()(
  'ProjectFolderLookupError',
  {},
) {
  override get message(): string {
    return (
      'The "projectFolder" setting uses the "<lookup>" token, but a tsconfig.json file cannot be' +
      ' found in this folder or any parent folder.'
    )
  }
}

export class ProjectFolderNotFoundError extends Schema.TaggedError<ProjectFolderNotFoundError>()(
  'ProjectFolderNotFoundError',
  {
    filePath: Schema.String,
  },
) {
  override get message(): string {
    return `The specified "projectFolder" path does not exist: ${this.filePath}`
  }
}

export class TsconfigFileNotFoundError extends Schema.TaggedError<TsconfigFileNotFoundError>()(
  'TsconfigFileNotFoundError',
  {
    filePath: Schema.String,
  },
) {
  override get message(): string {
    return `The file referenced by "tsconfigFilePath" does not exist: ${this.filePath}`
  }
}

/** A configuration that asks for a feature this engine does not implement. */
export class UnsupportedFeatureError extends Schema.TaggedError<UnsupportedFeatureError>()(
  'UnsupportedFeatureError',
  {
    feature: Schema.String,
  },
) {
  override get message(): string {
    return `The "${this.feature}" setting is not supported by this implementation of API Extractor`
  }
}
