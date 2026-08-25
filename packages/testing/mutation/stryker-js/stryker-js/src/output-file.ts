import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

export const writeOutputFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  fileName: string,
  content: string,
): Effect.Effect<void, PlatformError, never> =>
  Effect.gen(function*() {
    yield* fs.makeDirectory(path.dirname(fileName), { recursive: true })
    yield* fs.writeFileString(fileName, content)
  })
