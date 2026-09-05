import { Schema } from 'effect'

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>()('FileNotFoundError', {
  filePath: Schema.String,
}) {}

export class DirectoryError extends Schema.TaggedError<DirectoryError>()('DirectoryError', {
  directoryPath: Schema.String,
}) {}
