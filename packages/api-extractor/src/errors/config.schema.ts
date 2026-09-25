import { Option, Predicate, Schema } from 'effect'

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
    issues: Schema.Array(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {
  override get message(): string {
    return `Error parsing ${this.filePath}: ${this.issues.join('; ')}`
  }
}

/** A `<token>` in a configuration path that no substitution resolves. */
export class UnresolvedTokenError extends Schema.TaggedError<UnresolvedTokenError>()('UnresolvedTokenError', {
  token: Schema.String,
  configPath: Schema.String,
}) {
  override get message(): string {
    return `The configuration value in ${this.configPath} contains an unrecognized token "${this.token}"`
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
