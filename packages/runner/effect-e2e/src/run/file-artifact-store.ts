import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Random from 'effect/Random'

import type { ArtifactRef } from '../report/report.schema.js'
import { ArtifactWriteFailed } from '../verdict/failure.schema.js'
import type { ArtifactStoreShape } from './artifact-store.service.js'
import { ArtifactStore } from './artifact-store.service.js'
import type { Artifact } from './artifact.schema.js'
import { fileNameOf } from './artifact.schema.js'

export interface FileArtifactStoreOptions {
  readonly root: string
  readonly output: string
}

const ARTIFACT_FILE_MODE = 0o600

const writeFailed = (at: string, error: PlatformError): ArtifactWriteFailed =>
  new ArtifactWriteFailed({
    message: `could not write artifact to ${at}: ${error.message}`,
    evidence: [{ _tag: 'LogEvidence', text: at }],
  })

export const make = (
  options: FileArtifactStoreOptions,
): Effect.Effect<ArtifactStoreShape, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const relativePathOf = (artifact: Artifact): string =>
      path.join(options.output, 'results', artifact.directory, fileNameOf(artifact.kind))

    const replaceAtomically = (target: string, bytes: Uint8Array): Effect.Effect<void, PlatformError> =>
      Effect.gen(function*() {
        yield* fs.makeDirectory(path.dirname(target), { recursive: true })
        const nonce = yield* Random.nextInt
        const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${nonce.toString(36)}.tmp`)
        yield* fs.writeFile(temporary, bytes, { flag: 'wx', mode: ARTIFACT_FILE_MODE }).pipe(
          Effect.andThen(fs.rename(temporary, target)),
          Effect.onError(() => Effect.ignore(fs.remove(temporary))),
        )
      })

    const put = (artifact: Artifact): Effect.Effect<ArtifactRef, ArtifactWriteFailed> => {
      const at = relativePathOf(artifact)
      return replaceAtomically(path.join(options.root, at), artifact.bytes).pipe(
        Effect.mapError((error) => writeFailed(at, error)),
        Effect.as({ kind: artifact.kind, path: at }),
      )
    }

    return ArtifactStore.of({ put })
  })

export const layer = (
  options: FileArtifactStoreOptions,
): Layer.Layer<ArtifactStore, never, FileSystem.FileSystem | Path.Path> => Layer.effect(ArtifactStore)(make(options))
