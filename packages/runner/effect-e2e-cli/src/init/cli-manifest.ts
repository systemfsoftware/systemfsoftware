import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'

import { SUITE_DEPENDENCIES } from '../templates/suite.js'
import { CliManifest } from './manifest.schema.js'

export const readCliManifest = (manifestUrl: URL) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const text = yield* fs.readFileString(yield* path.fromFileUrl(manifestUrl))
    return yield* Schema.decodeEffect(CliManifest)(text)
  }).pipe(Effect.orDie)

export const suiteDependenciesOf = (manifest: CliManifest): Readonly<Record<string, string>> =>
  Record.fromEntries(
    SUITE_DEPENDENCIES.map((name) => [
      name,
      Option.getOrThrowWith(
        Option.orElse(Record.get(manifest.dependencies, name), () => Record.get(manifest.peerDependencies, name)),
        () => new Error(`the CLI's package.json declares no range for ${name}`),
      ),
    ]),
  )
