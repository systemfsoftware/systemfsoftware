import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

import { ancestorsNearestFirst, filePresent, PACKAGE_FILE_NAME } from './folder-walk.js'
import { JsonRecordFromString } from './json-record.schema.js'

const versionPattern = /^v?(\d+)\.(\d+)\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

type MajorMinor = readonly [number, number]

const majorThenMinorKey = (version: MajorMinor): number => version[0] * 1_000_000 + version[1]

const majorMinorOf = (version: string): Option.Option<MajorMinor> =>
  Option.map(
    Option.fromNullishOr(versionPattern.exec(version)),
    (found): MajorMinor => [Number(found[1]), Number(found[2])],
  )

const isNewerThan = (target: MajorMinor, bundled: MajorMinor): boolean =>
  majorThenMinorKey(target) > majorThenMinorKey(bundled)

const newerThan = (bundledVersion: string) => (targetVersion: string): Option.Option<string> =>
  Option.flatMap(
    majorMinorOf(bundledVersion),
    (bundled) =>
      Option.flatMap(majorMinorOf(targetVersion), (target) =>
        isNewerThan(target, bundled) ? Option.some(targetVersion) : Option.none<string>()),
  )

const resolveTypeScriptModule = Option.liftThrowable((projectFolder: string): string =>
  process.getBuiltinModule('module').createRequire(`${projectFolder}/`).resolve('typescript')
)

const versionOfContents = (contents: string): Option.Option<string> =>
  Option.flatMap(
    Schema.decodeOption(JsonRecordFromString)(contents),
    (record) => Option.filter(Option.fromNullishOr(record['version']), Schema.is(Schema.String)),
  )

/**
 * The target project's TypeScript version when upstream's compatibility heuristic notices it: a
 * newer major release, or the same major with a newer minor. The module is resolved from the
 * project folder and its version read from the nearest package manifest, exactly as upstream's
 * `_checkCompilerCompatibility` does; every resolution failure simply means "no notice".
 */
export const newerProjectTypeScriptVersion = dual<
  (
    bundledVersion: string,
  ) => (projectFolder: string) => Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path>,
  (
    projectFolder: string,
    bundledVersion: string,
  ) => Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path>
>(2, (projectFolder: string, bundledVersion: string): Effect.Effect<
  Option.Option<string>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolved = yield* Effect.sync(() => resolveTypeScriptModule(projectFolder))
    const parents = Option.match(resolved, {
      onNone: (): readonly string[] => [],
      onSome: (found) => ancestorsNearestFirst(path.dirname(found), path),
    })
    const manifests = yield* Effect.forEach(parents, (folder) => filePresent(path.join(folder, PACKAGE_FILE_NAME), fs))
    const contents = yield* Option.match(Option.firstSomeOf(manifests), {
      onNone: () => Effect.succeed(''),
      onSome: (manifest) => Effect.orElseSucceed(fs.readFileString(manifest), () => ''),
    })
    return Option.flatMap(versionOfContents(contents), newerThan(bundledVersion))
  }))
