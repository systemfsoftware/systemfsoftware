import { Schema } from 'effect'

export class EmptyRoot extends Schema.TaggedError<EmptyRoot>()('EmptyRoot', {
  root: Schema.String,
}) {
  override get message(): string {
    return `no files scanned under root: ${this.root}`
  }
}

export class MissingRoot extends Schema.TaggedError<MissingRoot>()('MissingRoot', {
  root: Schema.String,
}) {
  override get message(): string {
    return `input root does not exist: ${this.root}`
  }
}

export class ConfigUnreadable extends Schema.TaggedError<ConfigUnreadable>()('ConfigUnreadable', {
  path: Schema.String,
  message: Schema.String,
}) {}

export class ArtifactMissing extends Schema.TaggedError<ArtifactMissing>()('ArtifactMissing', {
  path: Schema.String,
}) {
  override get message(): string {
    return `committed artifact is missing: ${this.path}`
  }
}

export class ArtifactDrift extends Schema.TaggedError<ArtifactDrift>()('ArtifactDrift', {
  path: Schema.String,
}) {
  override get message(): string {
    return `committed artifact differs byte-for-byte from regeneration: ${this.path}`
  }
}

export class UndeclaredEntries extends Schema.TaggedError<UndeclaredEntries>()('UndeclaredEntries', {
  entries: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `undeclared entries: ${this.entries.join(', ')}`
  }
}

export class StaleDeclarations extends Schema.TaggedError<StaleDeclarations>()('StaleDeclarations', {
  entries: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `stale declarations: ${this.entries.join(', ')}`
  }
}

export const DebtLedgerError = Schema.Union([
  EmptyRoot,
  MissingRoot,
  ConfigUnreadable,
  ArtifactMissing,
  ArtifactDrift,
  UndeclaredEntries,
  StaleDeclarations,
])
export type DebtLedgerError = typeof DebtLedgerError.Type
