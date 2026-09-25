import * as Schema from 'effect/Schema'

import { LogLevel } from './collector/message-router.schema.js'
import { Verbosity } from './collector/verbosity.schema.js'
import { NewlineKind } from './config/config-file.schema.js'

export const EmitLineStep = Schema.TaggedStruct('EmitLine', {
  level: LogLevel,
  text: Schema.String,
})
export type EmitLineStep = Schema.Schema.Type<typeof EmitLineStep>

export const EnsureDirectoryStep = Schema.TaggedStruct('EnsureDirectory', {
  directoryPath: Schema.String,
})
export type EnsureDirectoryStep = Schema.Schema.Type<typeof EnsureDirectoryStep>

export const WriteFileStep = Schema.TaggedStruct('WriteFile', {
  filePath: Schema.String,
  content: Schema.String,
})
export type WriteFileStep = Schema.Schema.Type<typeof WriteFileStep>

export const WriteStep = Schema.Union([EmitLineStep, EnsureDirectoryStep, WriteFileStep])
export type WriteStep = Schema.Schema.Type<typeof WriteStep>

export const WritePlan = Schema.Struct({
  lines: Schema.Array(EmitLineStep),
  directories: Schema.Array(EnsureDirectoryStep),
  files: Schema.Array(WriteFileStep),
})
export type WritePlan = Schema.Schema.Type<typeof WritePlan>

export const ConsoleTextLine = Schema.Struct({
  level: LogLevel,
  text: Schema.String,
})
export type ConsoleTextLine = Schema.Schema.Type<typeof ConsoleTextLine>

export const RenderedRollupText = Schema.Struct({
  filePath: Schema.String,
  directoryPath: Schema.String,
  content: Schema.String,
})
export type RenderedRollupText = Schema.Schema.Type<typeof RenderedRollupText>

export const TsdocMetadataWrite = Schema.Struct({
  filePath: Schema.String,
  directoryPath: Schema.String,
  content: Schema.String,
})
export type TsdocMetadataWrite = Schema.Schema.Type<typeof TsdocMetadataWrite>

export const ExtractionMaterial = Schema.Struct({
  verbosity: Verbosity,
  newlineKind: NewlineKind,
  compilerVersion: Schema.String,
  consoleLines: Schema.Array(ConsoleTextLine),
  residueLines: Schema.Array(ConsoleTextLine),
  rollups: Schema.Array(RenderedRollupText),
  tsdocMetadata: Schema.Array(TsdocMetadataWrite),
})
export type ExtractionMaterial = Schema.Schema.Type<typeof ExtractionMaterial>
