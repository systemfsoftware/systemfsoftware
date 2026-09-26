import * as Schema from 'effect/Schema'

import { LogLevel } from './collector/message-router.schema.js'
import { Verbosity } from './collector/verbosity.schema.js'
import { NewlineKind } from './config/config-file.schema.js'

export const ConsoleTextLine = Schema.Struct({
  level: LogLevel,
  text: Schema.String,
})
export type ConsoleTextLine = Schema.Schema.Type<typeof ConsoleTextLine>

export const RenderedRollupText = Schema.Struct({
  filePath: Schema.String,
  directoryPath: Schema.String,
  content: Schema.String,
  lineText: Schema.String,
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
  compilerVersionNotice: Schema.optional(Schema.String),
  consoleLines: Schema.Array(ConsoleTextLine),
  residueLines: Schema.Array(ConsoleTextLine),
  rollups: Schema.Array(RenderedRollupText),
  tsdocMetadata: Schema.Array(TsdocMetadataWrite),
})
export type ExtractionMaterial = Schema.Schema.Type<typeof ExtractionMaterial>
