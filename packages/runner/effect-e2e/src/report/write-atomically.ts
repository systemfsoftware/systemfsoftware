import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Random from 'effect/Random'

import { ArtifactWriteFailed } from '../verdict/failure.schema.js'

const REPORT_FILE_MODE = 0o644

export interface AtomicWrite {
  readonly root: string
  readonly output: string
  readonly file: string
  readonly text: string
}

const writeFailed = (relative: string) => (error: PlatformError): ArtifactWriteFailed =>
  new ArtifactWriteFailed({
    message: `the report file ${relative} could not be written: ${error.message}`,
    evidence: [{ _tag: 'LogEvidence', text: relative }],
  })

export const writeAtomically = (
  request: AtomicWrite,
): Effect.Effect<void, ArtifactWriteFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relative = path.join(request.output, request.file)
    const target = path.join(request.root, relative)
    const directory = path.dirname(target)
    const temporary = path.join(directory, `.${path.basename(target)}.${(yield* Random.nextInt).toString(36)}.tmp`)
    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(temporary, request.text, { flag: 'wx', mode: REPORT_FILE_MODE })),
      Effect.andThen(fs.rename(temporary, target)),
      Effect.onError(() => Effect.ignore(fs.remove(temporary))),
      Effect.mapError(writeFailed(relative)),
    )
  })
