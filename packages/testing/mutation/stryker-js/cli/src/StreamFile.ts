import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Stdio from 'effect/Stdio'
import * as Stream from 'effect/Stream'

import { makeRunEventStream, RunEventStreamPort } from './Output.js'

export const STREAM_FILE_DIR = 'reports'
export const STREAM_FILE_NAME = 'mutation-stream.jsonl'

export const drainStreamFile = (
  framed: Stream.Stream<string>,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = path.join(STREAM_FILE_DIR, STREAM_FILE_NAME)
    yield* fs.makeDirectory(STREAM_FILE_DIR, { recursive: true }).pipe(Effect.ignore)
    yield* fs.writeFileString(file, '', { flag: 'w' }).pipe(Effect.ignore)
    yield* Stream.runForEach(framed, (line) => fs.writeFileString(file, line, { flag: 'a' }).pipe(Effect.ignore))
  })

export const RunEventStreamFileLive = Layer.effect(
  RunEventStreamPort,
  Effect.gen(function*() {
    const stdio = yield* Stdio.Stdio
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const drainFramed = (framed: Stream.Stream<string>) =>
      drainStreamFile(framed).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      )
    return RunEventStreamPort.of({
      createRunEventStream: (resolved) => makeRunEventStream(stdio, resolved, drainFramed),
    })
  }),
)
