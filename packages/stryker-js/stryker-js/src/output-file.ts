import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

/**
 * Port over output-file writing, shaped as the subset of `FileSystem` +
 * `Path` feature code may use: ensure the parent directory exists, then
 * write the file. The Node implementation ships as `OutputFileLive` below;
 * tests that do not need real file writes substitute a layer returning
 * fixed outcomes.
 *
 * @since 2.0.0
 */
export class OutputFile extends Context.Service<OutputFile, {
  readonly writeOutputFile: (fileName: string, content: string) => Effect.Effect<void, PlatformError, never>
}>()('@systemfsoftware/stryker-js/OutputFile') {}

export const OutputFileLive: Layer.Layer<OutputFile, never, FileSystem.FileSystem | Path.Path> = Layer.effect(
  OutputFile,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return {
      writeOutputFile: (fileName, content) =>
        Effect.gen(function*() {
          yield* fs.makeDirectory(path.dirname(fileName), { recursive: true })
          yield* fs.writeFileString(fileName, content)
        }),
    }
  }),
)
