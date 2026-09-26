import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { formatPatch, structuredPatch } from 'diff'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'

import { convertToLf } from './analyzer/text.js'
import { formatConsoleLine } from './collector/message-router.js'
import { apiReportDiffText } from './console-text.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import { ReportWriteRefusedError } from './errors/write-refusal.schema.js'
import { ensureDirectoryFailureTextOf } from './filesystem-error-text.js'
import { convertNewlines } from './generators/index.js'
import { MessageWriter } from './message-writer.service.js'
import { writePlan, WritePlanCommand } from './write-plan.workflow.js'

type WritePlanEncoded = (typeof WritePlanCommand)['Encoded']

const readWritePlan = (command: WritePlanEncoded): Effect.Effect<WritePlanEncoded, never> => Effect.succeed(command)

const refusedDirectory = (failure: PlatformError): ReportWriteRefusedError =>
  new ReportWriteRefusedError({ text: ensureDirectoryFailureTextOf(failure) })

const diffLine = (event: {
  readonly reportShortPath: string
  readonly reportTempShortPath: string
  readonly baselineContent: string
  readonly generatedText: string
}): string =>
  apiReportDiffText(
    formatPatch(
      structuredPatch(
        event.reportShortPath,
        event.reportTempShortPath,
        convertToLf(event.baselineContent),
        event.generatedText,
      ),
    ),
  )

export const writePlanCell: Cell.Cell<
  WritePlanEncoded,
  ReadonlyArray<void>,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | MessageWriter
> = Sandwich.named('api_extractor.write_plan')(readWritePlan)
  .decide(writePlan)
  .write({
    EmitLine: (line) =>
      Effect.flatMap(MessageWriter, (writer) => writer.write(line.level, formatConsoleLine(line.level, line.text))),
    EnsureDirectory: (directory) =>
      Effect.mapError(
        Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeDirectory(directory.directoryPath, { recursive: true })),
        refusedDirectory,
      ),
    WriteFile: (file) =>
      Effect.flatMap(
        FileSystem.FileSystem,
        (fs) => fs.writeFileString(file.filePath, convertNewlines(file.content, file.newlineKind)),
      ),
    ReportDiff: (event) =>
      Effect.flatMap(
        MessageWriter,
        (writer) => writer.write(event.level, formatConsoleLine(event.level, diffLine(event))),
      ),
    RefuseReport: (refusal) => Effect.fail(new ReportWriteRefusedError({ text: refusal.text })),
    CommandRejected: (rejected) =>
      Effect.die(new InternalInvariantError({ message: 'The write plan failed to decode', cause: rejected })),
  })
