import { layer as nodeFileSystemLayer } from '@effect/platform-node-shared/NodeFileSystem'
import { layer as nodePathLayer } from '@effect/platform-node-shared/NodePath'
import { Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

/** Filesystem and path services for the suites that drive fixtures off disk. */
export const FixtureIO = Layer.mergeAll(nodeFileSystemLayer, nodePathLayer)

export const fixturesDir = new URL('./fixtures/', import.meta.url)

export const snapshotsDir = new URL('./snapshots/', import.meta.url)

/** Entry names directly inside a directory. */
export const listNames = (dir: URL) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readDirectory(yield* path.fromFileUrl(dir))
  })

/** Raw bytes of one fixture tarball. */
export const readTarball = (dir: URL, name: string) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFile(yield* path.fromFileUrl(new URL(`./${name}`, dir)))
  })
