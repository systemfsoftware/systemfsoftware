import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

import { fileNameOf, ResultDirectory } from './artifact.schema.js'
import type { FileArtifactStoreOptions } from './file-artifact-store.js'

const isNotFound = (error: PlatformError): boolean => Predicate.isTagged(error.reason, 'NotFound')

export const removeAiTraces = (
  options: FileArtifactStoreOptions,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const results = path.join(options.root, options.output, 'results')
    const directories = yield* fs.readDirectory(results).pipe(
      Effect.catchIf(isNotFound, () => Effect.succeed<ReadonlyArray<string>>([])),
    )
    yield* Effect.forEach(
      directories.filter(Schema.is(ResultDirectory)),
      (directory) => fs.remove(path.join(results, directory, fileNameOf('ai-trace')), { force: true }),
      { discard: true },
    )
  })
