import { Schema } from 'effect'

export class ConfigFileMissingError extends Schema.TaggedError<ConfigFileMissingError>()('ConfigFileMissingError', {
  path: Schema.String,
}) {
  override get message(): string {
    return `no transition-diagram config at ${this.path}`
  }
}

export class ConfigDecodeError extends Schema.TaggedError<ConfigDecodeError>()('ConfigDecodeError', {
  detail: Schema.String,
}) {
  override get message(): string {
    return `invalid transition-diagram config: ${this.detail}`
  }
}

export class ModuleImportError extends Schema.TaggedError<ModuleImportError>()('ModuleImportError', {
  module: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `could not import ${this.module}: ${this.detail}`
  }
}

export class UnrecognizedModuleError extends Schema.TaggedError<UnrecognizedModuleError>()(
  'UnrecognizedModuleError',
  {
    module: Schema.String,
  },
) {
  override get message(): string {
    return `module exports no workflow schemas: ${this.module}`
  }
}

export class DiagramRenderError extends Schema.TaggedError<DiagramRenderError>()('DiagramRenderError', {
  diagram: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `could not render ${this.diagram}: ${this.detail}`
  }
}

export class ArtifactStaleError extends Schema.TaggedError<ArtifactStaleError>()('ArtifactStaleError', {
  path: Schema.String,
}) {
  override get message(): string {
    return `stale artifact: ${this.path}`
  }
}

export class ArtifactMissingError extends Schema.TaggedError<ArtifactMissingError>()('ArtifactMissingError', {
  path: Schema.String,
}) {
  override get message(): string {
    return `missing artifact: ${this.path}`
  }
}

export class ArtifactOrphanError extends Schema.TaggedError<ArtifactOrphanError>()('ArtifactOrphanError', {
  path: Schema.String,
}) {
  override get message(): string {
    return `orphan artifact: ${this.path}`
  }
}
