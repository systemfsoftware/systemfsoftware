import * as Schema from 'effect/Schema'

import { LogLevel } from './collector/message-router.schema.js'

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
