import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { PackageVersion } from './package-version.schema.js'

export const packageVersion: Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> = Effect.orDie(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = yield* path.fromFileUrl(new URL('../package.json', import.meta.url))
    const text = yield* fs.readFileString(file)
    const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PackageVersion))(text)
    return manifest.version
  }),
)
