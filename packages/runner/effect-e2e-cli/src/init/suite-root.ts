import * as Bool from 'effect/Boolean'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

import { NamedManifest } from './manifest.schema.js'

const nearestPackageRoot = (
  from: string,
  cwd: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const parent = path.dirname(from)
    const holdsManifest = yield* Effect.orElseSucceed(fs.exists(path.join(from, 'package.json')), () => false)
    return yield* Bool.match(holdsManifest, {
      onTrue: () => Effect.succeed(from),
      onFalse: () =>
        Bool.match(parent === from, {
          onTrue: () => Effect.succeed(cwd),
          onFalse: () => nearestPackageRoot(parent, cwd),
        }),
    })
  })

export const suiteRootOf = (
  dir: Option.Option<string>,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(Path.Path, (path) => {
    const cwd = path.resolve('.')
    return Option.match(dir, {
      onNone: () => nearestPackageRoot(cwd, cwd),
      onSome: (relative) => Effect.succeed(path.resolve(cwd, relative)),
    })
  })

const kebabOf = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/^[-._]+|[-._]+$/gu, '')

export const projectIdOf = (suite: { readonly directory: string; readonly manifest: Option.Option<string> }): string =>
  Option.getOrElse(
    Option.flatMap(suite.manifest, (text) => Option.map(Schema.decodeOption(NamedManifest)(text), ({ name }) => name)),
    () => Option.getOrElse(Option.liftPredicate(kebabOf(suite.directory), (id) => id !== ''), () => 'e2e-suite'),
  )
