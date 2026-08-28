import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Stdio from 'effect/Stdio'
import * as Stream from 'effect/Stream'

import { makeRunEventStream, RunEventStreamPort } from './Output.js'

export const DEFAULT_PROGRESS_STREAM_FILE = 'reports/mutation-stream.jsonl'

const encodeUtf8 = (line: string): Uint8Array => new TextEncoder().encode(line)

const drainStreamFile = (
  fileName: string,
  framed: Stream.Stream<string>,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.dirname(fileName), { recursive: true }).pipe(Effect.orDie)
    yield* Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* fs.open(fileName, { flag: 'w' })
        yield* Stream.runForEach(framed, (line) =>
          handle.writeAll(encodeUtf8(line)).pipe(Effect.flatMap(() => handle.sync)))
      }),
    ).pipe(Effect.orDie)
  })

export const RunEventStreamFileLive = Layer.effect(
  RunEventStreamPort,
  Effect.gen(function*() {
    const stdio = yield* Stdio.Stdio
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const fileNameRef = yield* Ref.make(DEFAULT_PROGRESS_STREAM_FILE)
    const drainFramed = (framed: Stream.Stream<string>) =>
      Effect.gen(function*() {
        const fileName = yield* Ref.get(fileNameRef)
        yield* drainStreamFile(fileName, framed).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        )
      })
    return RunEventStreamPort.of({
      createRunEventStream: (resolved) =>
        Effect.gen(function*() {
          const stream = yield* makeRunEventStream(stdio, resolved, drainFramed)
          return {
            ...stream,
            setProgressStreamFile: (fileName: string) => Ref.set(fileNameRef, fileName),
          }
        }),
    })
  }),
)
