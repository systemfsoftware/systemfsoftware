import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import type * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { type BadArgument, type PlatformError } from 'effect/PlatformError'

/**
 * A committed fixture package read off disk and handed to a check as an in-memory
 * filesystem rooted at the fixture's own path.
 *
 * The root is the fixture's real path so the two readers in a run agree: the engine's
 * `FileSystem` service reads the seeded bytes, while the TypeScript compiler behind its
 * port reads the same committed files through `Ts.sys`. Everything a checked run writes
 * lands in memory, so a check never touches the working tree.
 */
export interface SeededFixture {
  readonly root: string
  readonly configPath: string
  readonly layer: Layer.Layer<FileSystem.FileSystem | MemoryFileSystem.Watcher>
}

export type FixtureReadError = PlatformError | BadArgument

const fixturesFolder = new URL('./', import.meta.url)

const fileEntry = (
  full: string,
): Effect.Effect<Option.Option<readonly [string, string]>, PlatformError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.flatMap(fs.stat(full), (info) =>
      info.type === 'File'
        ? Effect.map(fs.readFileString(full), (text) => Option.some<readonly [string, string]>([full, text]))
        : Effect.succeed(Option.none<readonly [string, string]>())))

export const seededFixture = (
  fixture: string,
): Effect.Effect<SeededFixture, FixtureReadError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* path.fromFileUrl(new URL(fixture, fixturesFolder))
    const entries = yield* fs.readDirectory(root, { recursive: true })
    const found = yield* Effect.forEach(entries, (entry) => fileEntry(path.join(root, entry)))
    return {
      root,
      configPath: path.join(root, 'api-extractor.json'),
      layer: MemoryFileSystem.make(Object.fromEntries(Arr.getSomes(found))).layer,
    }
  })